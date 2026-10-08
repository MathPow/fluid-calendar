import type { CalendarEvent, CalendarFeed } from "@/types/calendar";
import type { Task } from "@/types/task";

/**
 * Numbers for the calendar's « Statistiques » popup: where the time of a day,
 * week, month or year goes — per organisation (work projects), per project
 * (scheduled tasks), per calendar, work vs personal — plus a few highlights.
 * Pure, so it can be tested and recomputed as the period changes.
 */

export type StatsPeriod = "day" | "week" | "month" | "year";

export interface StatsOrg {
  id: string;
  name: string;
  color: string | null;
  station?: string | null;
}

export interface Range {
  start: Date;
  end: Date;
}

const HOUR = 3_600_000;

/** The period containing `date`; weeks start on `weekStart` (0 = Sunday). */
export function periodRange(
  period: StatsPeriod,
  date: Date,
  weekStart: number
): Range {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  switch (period) {
    case "day":
      return { start: d, end: new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1) };
    case "week": {
      const back = (d.getDay() - weekStart + 7) % 7;
      const start = new Date(d.getFullYear(), d.getMonth(), d.getDate() - back);
      return {
        start,
        end: new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7),
      };
    }
    case "month":
      return {
        start: new Date(d.getFullYear(), d.getMonth(), 1),
        end: new Date(d.getFullYear(), d.getMonth() + 1, 1),
      };
    case "year":
      return {
        start: new Date(d.getFullYear(), 0, 1),
        end: new Date(d.getFullYear() + 1, 0, 1),
      };
  }
}

/** The same period shifted by `step` (−1 = the one before). */
export function shiftPeriod(
  period: StatsPeriod,
  date: Date,
  step: number
): Date {
  const d = new Date(date);
  if (period === "day") d.setDate(d.getDate() + step);
  else if (period === "week") d.setDate(d.getDate() + 7 * step);
  else if (period === "month") d.setMonth(d.getMonth() + step, 1);
  else d.setFullYear(d.getFullYear() + step, 0, 1);
  return d;
}

const toDate = (v: Date | string) => (v instanceof Date ? v : new Date(v));

/** Hours of [start, end) that fall inside the range. */
function clippedHours(start: Date, end: Date, range: Range) {
  const s = Math.max(start.getTime(), range.start.getTime());
  const e = Math.min(end.getTime(), range.end.getTime());
  return Math.max(0, e - s) / HOUR;
}

/** Total length of the union of intervals (overlaps counted once), in hours. */
function unionHours(intervals: [number, number][]) {
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  let total = 0;
  let cur: [number, number] | null = null;
  for (const [s, e] of sorted) {
    if (!cur || s > cur[1]) {
      if (cur) total += cur[1] - cur[0];
      cur = [s, e];
    } else cur[1] = Math.max(cur[1], e);
  }
  if (cur) total += cur[1] - cur[0];
  return total / HOUR;
}

export interface Bucket {
  key: string;
  label: string;
  color: string | null;
  hours: number;
  count: number;
}

export interface ChartBar {
  label: string;
  hours: number;
  /** The bar's start, to jump the calendar there. */
  date: Date;
}

export interface CalendarStats {
  range: Range;
  /** Sum of timed event lengths inside the period. */
  eventHours: number;
  /** Time with at least one event (overlaps counted once). */
  busyHours: number;
  eventCount: number;
  allDayCount: number;
  meetingCount: number;
  meetingHours: number;
  avgEventMinutes: number;
  /** Busy hours per day of the period. */
  perDay: number;
  /** Busy hours of the previous period, for the trend. */
  previousBusyHours: number;
  byOrganisation: Bucket[];
  byStation: { work: number; personal: number; other: number };
  byCalendar: Bucket[];
  byProject: Bucket[];
  taskHours: number;
  tasksCompleted: number;
  tasksDue: number;
  tasksOverdue: number;
  chart: ChartBar[];
  busiest: ChartBar | null;
  longest: { title: string; hours: number; start: Date } | null;
}

interface Input {
  period: StatsPeriod;
  range: Range;
  previous: Range;
  /** Calendar items (events + tasks-as-events) over previous.start → range.end. */
  items: CalendarEvent[];
  tasks: Task[];
  feeds: CalendarFeed[];
  orgs: StatsOrg[];
  locale: string;
  /** Feeds hidden from the calendar (disabled / other station) to skip. */
  isVisibleFeed: (feedId: string) => boolean;
  labels: { noOrganisation: string; noProject: string; noCalendar: string };
}

function chartBuckets(period: StatsPeriod, range: Range, locale: string) {
  const bars: ChartBar[] = [];
  const s = range.start;
  if (period === "day") {
    for (let h = 0; h < 24; h++)
      bars.push({
        label: String(h),
        hours: 0,
        date: new Date(s.getFullYear(), s.getMonth(), s.getDate(), h),
      });
  } else if (period === "year") {
    for (let m = 0; m < 12; m++) {
      const date = new Date(s.getFullYear(), m, 1);
      bars.push({
        label: date.toLocaleDateString(locale, { month: "narrow" }),
        hours: 0,
        date,
      });
    }
  } else {
    for (
      let d = new Date(s);
      d < range.end;
      d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)
    ) {
      bars.push({
        label:
          period === "week"
            ? d.toLocaleDateString(locale, { weekday: "short" })
            : String(d.getDate()),
        hours: 0,
        date: d,
      });
    }
  }
  return bars;
}

/** Spread [start, end) over the chart bars (each bar is one unit long). */
function addToChart(bars: ChartBar[], start: number, end: number) {
  for (let i = 0; i < bars.length; i++) {
    const bs = bars[i].date.getTime();
    const be = i + 1 < bars.length ? bars[i + 1].date.getTime() : Infinity;
    const h = (Math.min(end, be) - Math.max(start, bs)) / HOUR;
    if (h > 0) bars[i].hours += h;
  }
}

function bump(
  map: Map<string, Bucket>,
  key: string,
  label: string,
  color: string | null,
  hours: number
) {
  const b = map.get(key) ?? { key, label, color, hours: 0, count: 0 };
  b.hours += hours;
  b.count += 1;
  map.set(key, b);
}

const sorted = (map: Map<string, Bucket>) =>
  [...map.values()]
    .filter((b) => b.hours > 0.001 || b.count > 0)
    .sort((a, b) => b.hours - a.hours || b.count - a.count);

/** Project name / colour / organisation of a task (Projets project first). */
export function taskProject(task: Task) {
  const p = task.project;
  if (!p) return null;
  return {
    id: p.id,
    name: p.agentProject?.name ?? p.name,
    color: p.agentProject?.color ?? p.color ?? null,
    organisationId:
      p.agentProject?.organisation?.id ?? p.organisation?.id ?? p.organisationId ?? null,
  };
}

export function computeCalendarStats(input: Input): CalendarStats {
  const { period, range, previous, feeds, orgs, labels } = input;
  const orgById = new Map(orgs.map((o) => [o.id, o]));
  const feedById = new Map(feeds.map((f) => [f.id, f]));
  const taskById = new Map(input.tasks.map((t) => [t.id, t]));

  const inRange: [number, number][] = [];
  const inPrevious: [number, number][] = [];
  const byOrg = new Map<string, Bucket>();
  const byCal = new Map<string, Bucket>();
  const byProject = new Map<string, Bucket>();
  const byStation = { work: 0, personal: 0, other: 0 };
  const chart = chartBuckets(period, range, input.locale);
  let eventHours = 0;
  let eventCount = 0;
  let allDayCount = 0;
  let meetingCount = 0;
  let meetingHours = 0;
  let taskHours = 0;
  let longest: CalendarStats["longest"] = null;

  for (const item of input.items) {
    const start = toDate(item.start);
    const end = toDate(item.end);
    const isTask = item.feedId === "tasks" || !!item.extendedProps?.isTask;
    if (!isTask && !input.isVisibleFeed(item.feedId)) continue;
    if (!isTask && item.status?.toString().toLowerCase() === "cancelled") continue;

    const hours = item.allDay ? 0 : clippedHours(start, end, range);
    const prevHours = item.allDay ? 0 : clippedHours(start, end, previous);
    if (prevHours > 0 && !isTask)
      inPrevious.push([
        Math.max(start.getTime(), previous.start.getTime()),
        Math.min(end.getTime(), previous.end.getTime()),
      ]);
    const overlaps = start < range.end && end > range.start;
    if (!overlaps) continue;

    if (isTask) {
      const task = taskById.get(item.extendedProps?.taskId ?? item.id);
      const project = task ? taskProject(task) : null;
      // Only time actually blocked for it, not a due-date marker.
      if (hours > 0 && task?.scheduledStart) {
        taskHours += hours;
        bump(
          byProject,
          project?.id ?? "none",
          project?.name ?? labels.noProject,
          project?.color ?? null,
          hours
        );
        if (project?.organisationId) {
          const org = orgById.get(project.organisationId);
          if (org) bump(byOrg, org.id, org.name, org.color, hours);
        }
      }
      continue;
    }

    eventCount += 1;
    if (item.allDay) {
      allDayCount += 1;
      continue;
    }
    eventHours += hours;
    const s = Math.max(start.getTime(), range.start.getTime());
    const e = Math.min(end.getTime(), range.end.getTime());
    inRange.push([s, e]);
    addToChart(chart, s, e);

    const feed = feedById.get(item.feedId);
    const orgId = item.organisationId ?? feed?.organisationId ?? null;
    const org = orgId ? orgById.get(orgId) : undefined;
    bump(
      byOrg,
      org?.id ?? "none",
      org?.name ?? labels.noOrganisation,
      org?.color ?? null,
      hours
    );
    bump(
      byCal,
      item.feedId,
      feed?.name ?? labels.noCalendar,
      feed?.color ?? null,
      hours
    );
    const station = org?.station ?? feed?.station ?? null;
    if (station === "work") byStation.work += hours;
    else if (station === "personal") byStation.personal += hours;
    else byStation.other += hours;

    if ((item.attendees?.length ?? 0) > 1) {
      meetingCount += 1;
      meetingHours += hours;
    }
    const full = (end.getTime() - start.getTime()) / HOUR;
    if (!longest || full > longest.hours)
      longest = { title: item.title, hours: full, start };
  }

  const days = Math.max(
    1,
    Math.round((range.end.getTime() - range.start.getTime()) / (24 * HOUR))
  );
  const busyHours = unionHours(inRange);

  // Tasks of the period: done in it, due in it, still late.
  const now = Date.now();
  let tasksCompleted = 0;
  let tasksDue = 0;
  let tasksOverdue = 0;
  for (const task of input.tasks) {
    const done = task.status === "completed";
    if (done && task.completedAt) {
      const at = toDate(task.completedAt).getTime();
      if (at >= range.start.getTime() && at < range.end.getTime())
        tasksCompleted += 1;
    }
    if (task.dueDate) {
      const due = toDate(task.dueDate).getTime();
      if (due >= range.start.getTime() && due < range.end.getTime()) {
        tasksDue += 1;
        if (!done && due < now) tasksOverdue += 1;
      }
    }
  }

  const busiest =
    period === "day"
      ? null
      : chart.reduce<ChartBar | null>(
          (best, b) => (b.hours > (best?.hours ?? 0) ? b : best),
          null
        );

  return {
    range,
    eventHours,
    busyHours,
    eventCount,
    allDayCount,
    meetingCount,
    meetingHours,
    avgEventMinutes:
      eventCount - allDayCount > 0
        ? (eventHours * 60) / (eventCount - allDayCount)
        : 0,
    perDay: busyHours / days,
    previousBusyHours: unionHours(inPrevious),
    byOrganisation: sorted(byOrg),
    byStation,
    byCalendar: sorted(byCal),
    byProject: sorted(byProject),
    taskHours,
    tasksCompleted,
    tasksDue,
    tasksOverdue,
    chart,
    busiest,
    longest,
  };
}
