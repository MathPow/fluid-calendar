"use client";

import { useEffect, useMemo, useState } from "react";

import { BarChart3, ChevronLeft, ChevronRight, Info } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { useLocale, useT } from "@/i18n/client";
import {
  type Bucket,
  type StatsOrg,
  type StatsPeriod,
  computeCalendarStats,
  periodRange,
  shiftPeriod,
} from "@/lib/calendar/stats";
import { cn } from "@/lib/utils";

import { useCalendarStore, useViewStore } from "@/store/calendar";
import { useSettingsStore } from "@/store/settings";
import { accountVisibleInStation, useStationStore } from "@/store/station";
import { useTaskStore } from "@/store/task";

const WORK_COLOR = "#4f6bed";
const PERSONAL_COLOR = "#f4a261";

const PERIODS: StatsPeriod[] = ["day", "week", "month", "year"];

const periodOfView = (view: string): StatsPeriod =>
  view === "day" ? "day" : view === "week" ? "week" : view === "month" ? "month" : "year";

/** "3 h 45", "45 min", "0 h". */
function hoursLabel(hours: number) {
  const total = Math.round(hours * 60);
  if (total === 0) return "0 h";
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m ? `${h} h ${String(m).padStart(2, "0")}` : `${h} h`;
}

/** Info bubble beside the view switcher that opens the stats popup. */
export function CalendarStatsButton({ className }: { className?: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
          className
        )}
        title={t("calendar.stats.open")}
        aria-label={t("calendar.stats.open")}
      >
        <Info className="h-[18px] w-[18px]" />
      </button>
      {open && <CalendarStatsDialog open={open} onOpenChange={setOpen} />}
    </>
  );
}

function CalendarStatsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const locale = useLocale() === "en" ? "en-CA" : "fr-CA";
  const { date: calendarDate, view, setDate, setView } = useViewStore();
  const [period, setPeriod] = useState<StatsPeriod>(periodOfView(view));
  const [anchor, setAnchor] = useState<Date>(new Date(calendarDate));
  const [orgs, setOrgs] = useState<StatsOrg[]>([]);
  const feeds = useCalendarStore((s) => s.feeds);
  const events = useCalendarStore((s) => s.events);
  const tasks = useTaskStore((s) => s.tasks);
  const weekStart =
    useSettingsStore((s) => s.user.weekStartDay) === "monday" ? 1 : 0;
  const station = useStationStore((s) => s.currentStation);

  useEffect(() => {
    fetch("/api/organisations")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: StatsOrg[]) => setOrgs(rows))
      .catch(() => undefined);
  }, []);

  const stats = useMemo(() => {
    const range = periodRange(period, anchor, weekStart);
    const previous = periodRange(
      period,
      shiftPeriod(period, anchor, -1),
      weekStart
    );
    const items = useCalendarStore
      .getState()
      .getAllCalendarItems(previous.start, range.end);
    return computeCalendarStats({
      period,
      range,
      previous,
      items,
      tasks,
      feeds,
      orgs,
      locale,
      isVisibleFeed: (id) => {
        const feed = feeds.find((f) => f.id === id);
        return !!feed?.enabled && accountVisibleInStation(feed.station, station);
      },
      labels: {
        noOrganisation: t("calendar.stats.noOrganisation"),
        noProject: t("calendar.stats.noProject"),
        noCalendar: t("calendar.stats.noCalendar"),
      },
    });
    // events: getAllCalendarItems reads them from the store.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, anchor, weekStart, tasks, feeds, events, orgs, locale, station, t]);

  const title = useMemo(() => {
    const s = stats.range.start;
    const last = new Date(stats.range.end.getTime() - 1);
    if (period === "day")
      return s.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" });
    if (period === "week")
      return `${s.toLocaleDateString(locale, { day: "numeric", month: "short" })} – ${last.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" })}`;
    if (period === "month")
      return s.toLocaleDateString(locale, { month: "long", year: "numeric" });
    return String(s.getFullYear());
  }, [stats.range, period, locale]);

  const trend =
    stats.previousBusyHours > 0
      ? Math.round(
          ((stats.busyHours - stats.previousBusyHours) /
            stats.previousBusyHours) *
            100
        )
      : null;
  // Hours every 6, days of a month every 5: labels that never get cut.
  const labelStep = period === "day" ? 6 : period === "month" ? 5 : 1;
  const maxBar = Math.max(...stats.chart.map((b) => b.hours), 0.0001);
  const stationTotal =
    stats.byStation.work + stats.byStation.personal + stats.byStation.other;

  /** Open the calendar on a chart bar (a day, or a month in the year). */
  const jump = (date: Date) => {
    setDate(date);
    setView(period === "year" ? "month" : "day");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] max-w-3xl overflow-y-auto p-0">
        <DialogHeader className="space-y-3 border-b border-border px-6 pb-4 pt-6">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            <DialogTitle>{t("calendar.stats.title")}</DialogTitle>
          </div>
          <DialogDescription className="sr-only">
            {t("calendar.stats.description")}
          </DialogDescription>
          <div className="flex flex-wrap items-center gap-2">
            <div className="segmented">
              {PERIODS.map((p) => (
                <button
                  key={p}
                  type="button"
                  className="segmented-item"
                  data-active={period === p}
                  onClick={() => setPeriod(p)}
                >
                  {t(`calendar.stats.period.${p}`)}
                </button>
              ))}
            </div>
            <div className="ml-auto flex items-center gap-1">
              <button
                type="button"
                onClick={() => setAnchor((a) => shiftPeriod(period, a, -1))}
                className="rounded-full p-1.5 hover:bg-secondary"
                aria-label={t("calendar.stats.previous")}
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="min-w-36 text-center text-[14px] font-semibold capitalize">
                {title}
              </span>
              <button
                type="button"
                onClick={() => setAnchor((a) => shiftPeriod(period, a, 1))}
                className="rounded-full p-1.5 hover:bg-secondary"
                aria-label={t("calendar.stats.next")}
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-6 px-6 pb-6 pt-5">
          {/* Headline numbers */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi
              label={t("calendar.stats.busy")}
              value={hoursLabel(stats.busyHours)}
              hint={
                trend === null
                  ? t("calendar.stats.noPrevious")
                  : t("calendar.stats.trend", {
                      sign: trend > 0 ? "+" : "",
                      pct: trend,
                    })
              }
              tone={trend === null ? undefined : trend > 0 ? "up" : "down"}
            />
            <Kpi
              label={t("calendar.stats.events")}
              value={String(stats.eventCount)}
              hint={
                stats.allDayCount
                  ? t("calendar.stats.allDay", { count: stats.allDayCount })
                  : t("calendar.stats.avgLength", {
                      length: hoursLabel(stats.avgEventMinutes / 60),
                    })
              }
            />
            <Kpi
              label={t("calendar.stats.perDay")}
              value={hoursLabel(stats.perDay)}
              hint={t("calendar.stats.meetings", {
                count: stats.meetingCount,
                hours: hoursLabel(stats.meetingHours),
              })}
            />
            <Kpi
              label={t("calendar.stats.tasksDone")}
              value={String(stats.tasksCompleted)}
              hint={
                stats.tasksOverdue
                  ? t("calendar.stats.overdue", { count: stats.tasksOverdue })
                  : t("calendar.stats.due", { count: stats.tasksDue })
              }
            />
          </div>

          {/* Time across the period */}
          {period !== "day" || stats.busyHours > 0 ? (
            <section>
              <SectionTitle>{t("calendar.stats.chart")}</SectionTitle>
              <div className="flex h-28 items-end gap-[3px]">
                {stats.chart.map((b, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => jump(b.date)}
                    className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1"
                    title={`${b.label} · ${hoursLabel(b.hours)}`}
                  >
                    <span
                      className={cn(
                        "w-full rounded-t-[4px] bg-foreground/80 transition-colors group-hover:bg-foreground",
                        b.hours === 0 && "bg-border"
                      )}
                      style={{
                        height: `${Math.max(3, (b.hours / maxBar) * 100)}%`,
                      }}
                    />
                  </button>
                ))}
              </div>
              <div className="mt-1 flex gap-[3px] text-[10px] text-muted-foreground">
                {stats.chart.map((b, i) => (
                  <span key={i} className="min-w-0 flex-1 overflow-visible whitespace-nowrap text-center">
                    {i % labelStep === 0 ? b.label : ""}
                  </span>
                ))}
              </div>
            </section>
          ) : null}

          {/* Work vs personal */}
          {stationTotal > 0 && (
            <section>
              <SectionTitle>{t("calendar.stats.station")}</SectionTitle>
              <div className="flex h-3 overflow-hidden rounded-full bg-secondary">
                <span
                  style={{
                    width: `${(stats.byStation.work / stationTotal) * 100}%`,
                    backgroundColor: WORK_COLOR,
                  }}
                />
                <span
                  style={{
                    width: `${(stats.byStation.personal / stationTotal) * 100}%`,
                    backgroundColor: PERSONAL_COLOR,
                  }}
                />
              </div>
              <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[12px]">
                <Legend color={WORK_COLOR} label={t("calendar.stats.work")} hours={stats.byStation.work} total={stationTotal} />
                <Legend color={PERSONAL_COLOR} label={t("calendar.stats.personal")} hours={stats.byStation.personal} total={stationTotal} />
                {stats.byStation.other > 0 && (
                  <Legend color="hsl(var(--border))" label={t("calendar.stats.unsorted")} hours={stats.byStation.other} total={stationTotal} />
                )}
              </div>
            </section>
          )}

          <div className="grid gap-6 md:grid-cols-2">
            <BucketList
              title={t("calendar.stats.byOrganisation")}
              hint={t("calendar.stats.byOrganisationHint")}
              buckets={stats.byOrganisation}
              empty={t("calendar.stats.empty")}
            />
            <BucketList
              title={t("calendar.stats.byProject")}
              hint={t("calendar.stats.byProjectHint", {
                hours: hoursLabel(stats.taskHours),
              })}
              buckets={stats.byProject}
              empty={t("calendar.stats.noScheduledTasks")}
            />
            <BucketList
              title={t("calendar.stats.byCalendar")}
              buckets={stats.byCalendar}
              empty={t("calendar.stats.empty")}
            />
            <section>
              <SectionTitle>{t("calendar.stats.highlights")}</SectionTitle>
              <dl className="space-y-2 text-[13px]">
                {stats.busiest && stats.busiest.hours > 0 && (
                  <Highlight
                    label={t(
                      period === "year"
                        ? "calendar.stats.busiestMonth"
                        : "calendar.stats.busiestDay"
                    )}
                    value={`${stats.busiest.date.toLocaleDateString(
                      locale,
                      period === "year"
                        ? { month: "long" }
                        : { weekday: "long", day: "numeric", month: "short" }
                    )} · ${hoursLabel(stats.busiest.hours)}`}
                  />
                )}
                {stats.longest && (
                  <Highlight
                    label={t("calendar.stats.longest")}
                    value={`${stats.longest.title} · ${hoursLabel(stats.longest.hours)}`}
                  />
                )}
                <Highlight
                  label={t("calendar.stats.scheduled")}
                  value={hoursLabel(stats.eventHours)}
                />
                {stats.eventHours - stats.busyHours > 0.25 && (
                  <Highlight
                    label={t("calendar.stats.overlap")}
                    value={hoursLabel(stats.eventHours - stats.busyHours)}
                  />
                )}
              </dl>
            </section>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <p className="etiquette mb-3">{children}</p>;
}

function Kpi({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "up" | "down";
}) {
  return (
    <div className="rounded-2xl bg-secondary/70 p-3.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-[22px] font-semibold tabular-nums tracking-title">
        {value}
      </p>
      <p
        className={cn(
          "mt-0.5 truncate text-[12px] text-muted-foreground",
          tone === "up" && "text-foreground"
        )}
      >
        {hint}
      </p>
    </div>
  );
}

function Legend({
  color,
  label,
  hours,
  total,
}: {
  color: string;
  label: string;
  hours: number;
  total: number;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
      <span className="font-medium">{label}</span>
      <span className="tabular-nums text-muted-foreground">
        {hoursLabel(hours)} · {Math.round((hours / total) * 100)} %
      </span>
    </span>
  );
}

function BucketList({
  title,
  hint,
  buckets,
  empty,
}: {
  title: string;
  hint?: string;
  buckets: Bucket[];
  empty: string;
}) {
  const total = buckets.reduce((s, b) => s + b.hours, 0);
  const max = Math.max(...buckets.map((b) => b.hours), 0.0001);
  const shown = buckets.slice(0, 8);
  return (
    <section>
      <SectionTitle>{title}</SectionTitle>
      {buckets.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">{empty}</p>
      ) : (
        <ul className="space-y-2.5">
          {shown.map((b) => (
            <li key={b.key}>
              <div className="flex items-baseline justify-between gap-3 text-[13px]">
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: b.color ?? "#a3a3a3" }}
                  />
                  <span className="truncate font-medium">{b.label}</span>
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {hoursLabel(b.hours)}
                  {total > 0 && ` · ${Math.round((b.hours / total) * 100)} %`}
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${(b.hours / max) * 100}%`,
                    backgroundColor: b.color ?? "#a3a3a3",
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
      {hint && buckets.length > 0 && (
        <p className="mt-2 text-[11px] text-muted-foreground">{hint}</p>
      )}
    </section>
  );
}

function Highlight({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="truncate text-right font-medium">{value}</dd>
    </div>
  );
}
