"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";

import Link from "next/link";

import {
  ArrowUpRight,
  AudioLines,
  Calendar,
  FileText,
  FolderGit2,
  ListTodo,
  Loader2,
  Mail,
  Mic,
  Monitor,
  NotebookPen,
  Plus,
  Receipt,
  Settings,
  Target,
  Users,
  Watch,
} from "lucide-react";

import {
  MachinesStatus,
  machineNote,
} from "@/components/dashboard/MachinesStatus";
import { MonthWidget } from "@/components/dashboard/MonthWidget";
import { ProjectLauncher } from "@/components/dashboard/ProjectLauncher";
import { StickyNotesWidget } from "@/components/dashboard/StickyNotesWidget";
import {
  CustomLinkMark,
  QuickLinksEditor,
} from "@/components/dashboard/QuickLinksEditor";
import { LauncherIcon } from "@/components/launchers/LauncherIcon";
import { runLauncher, useLaunchers } from "@/components/launchers/useLaunchers";
import { StatusDot } from "@/components/machines/MachineMeters";
import { useMachineStatus } from "@/components/machines/useMachineStatus";
import { NewsTile } from "@/components/notifications/NewsTile";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { type TranslateFn, useT } from "@/i18n/client";
import {
  type CustomLink,
  QUICK_LINK_IDS,
  type WidgetOptions,
  type WidgetType,
} from "@/lib/dashboard/layout";
import { machineHealth } from "@/lib/machines/health";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ data */

interface EventItem {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location: string | null;
  feed?: { name: string; color: string | null };
}

interface TaskItem {
  id: string;
  title: string;
  status: string;
  dueDate: string | null;
  priority: string | null;
}

interface RecordingItem {
  id: string;
  title: string;
  source: string;
  status: string;
  recordedAt: string;
  hasTranscript: boolean;
}

interface NoteEntry {
  path: string;
  name: string;
  type: "file" | "directory";
  lastModified: string | null;
}

// A unified "recent change" — either a touched note or a synced recording.
interface RecentChange {
  key: string;
  kind: "note" | "recording";
  title: string;
  ts: number;
  href: string;
  source?: string;
  processing?: boolean;
}

export const startOfDay = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};
const endOfDay = (d: Date) => {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
};
const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

const timeLabel = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });

const isToday = (iso: string) =>
  startOfDay(new Date(iso)).getTime() === startOfDay(new Date()).getTime();

const whenLabel = (t: TranslateFn, e: EventItem) => {
  const today = isToday(e.start);
  if (e.allDay)
    return today
      ? t("dashboard.nextUp.allDayToday")
      : new Date(e.start).toLocaleDateString(undefined, {
          weekday: "long",
          month: "long",
          day: "numeric",
        });
  return `${
    today
      ? t("dashboard.schedule.day.today")
      : new Date(e.start).toLocaleDateString(undefined, { weekday: "long" })
  } · ${timeLabel(e.start)}`;
};

const relativeDue = (t: TranslateFn, iso: string) => {
  const due = startOfDay(new Date(iso)).getTime();
  const today = startOfDay(new Date()).getTime();
  const days = Math.round((due - today) / 86_400_000);
  if (days < 0)
    return {
      label: t("dashboard.tasks.dueOverdue", { count: Math.abs(days) }),
      tone: "negative" as const,
    };
  if (days === 0)
    return {
      label: t("dashboard.schedule.day.today"),
      tone: "pending" as const,
    };
  if (days === 1)
    return {
      label: t("dashboard.schedule.day.tomorrow"),
      tone: "default" as const,
    };
  if (days < 7)
    return {
      label: t("dashboard.tasks.dueInDays", { count: days }),
      tone: "default" as const,
    };
  return {
    label: new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    }),
    tone: "default" as const,
  };
};

const recSourceIcon = (s: string) =>
  s === "watch" ? Watch : s === "meetily" ? Mic : AudioLines;

const timeAgo = (t: TranslateFn, ts: number) => {
  const diff = Date.now() - ts;
  const min = Math.round(diff / 60_000);
  if (min < 1) return t("dashboard.recent.justNow");
  if (min < 60) return t("dashboard.recent.minAgo", { count: min });
  const hr = Math.round(min / 60);
  if (hr < 24) return t("dashboard.recent.hAgo", { count: hr });
  const days = Math.round(hr / 24);
  if (days < 7) return t("dashboard.recent.dAgo", { count: days });
  return new Date(ts).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
};

const isoWeek = (d: Date) => {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(
    ((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7
  );
};

const pad = (n: number) => String(n).padStart(2, "0");

/** Everything the dashboard sections read, fetched once for the page. */
export function useDashboardData() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [recordings, setRecordings] = useState<RecordingItem[]>([]);
  const [notes, setNotes] = useState<NoteEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [evRes, tkRes, rcRes, ntRes] = await Promise.all([
          fetch("/api/events"),
          fetch(
            "/api/tasks?status=ready&status=todo&status=in_progress&status=blocked"
          ),
          fetch("/api/recordings"),
          fetch("/api/notes"),
        ]);
        if (cancelled) return;
        setEvents(evRes.ok ? await evRes.json() : []);
        setTasks(tkRes.ok ? await tkRes.json() : []);
        const rc = rcRes.ok ? await rcRes.json() : { recordings: [] };
        setRecordings(rc.recordings ?? []);
        const nt = ntRes.ok ? await ntRes.json() : { entries: [] };
        setNotes(nt.entries ?? []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Everything that hasn't ended yet, soonest first.
  const upcoming = useMemo(() => {
    const now = Date.now();
    return events
      .filter((e) => new Date(e.end).getTime() >= now)
      .sort((a, b) => +new Date(a.start) - +new Date(b.start));
  }, [events]);

  const todayEvents = useMemo(() => {
    const from = startOfDay(new Date()).getTime();
    const to = endOfDay(new Date()).getTime();
    return events
      .filter((e) => {
        const s = new Date(e.start).getTime();
        return s >= from && s <= to;
      })
      .sort((a, b) => +new Date(a.start) - +new Date(b.start));
  }, [events]);

  const openTasks = useMemo(() => {
    return [...tasks].sort((a, b) => {
      if (!a.dueDate && !b.dueDate) return 0;
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return +new Date(a.dueDate) - +new Date(b.dueDate);
    });
  }, [tasks]);

  const dueToday = useMemo(() => {
    const to = endOfDay(new Date()).getTime();
    return openTasks.filter(
      (t) => t.dueDate && new Date(t.dueDate).getTime() <= to
    ).length;
  }, [openTasks]);

  // Merge recently-touched notes and recordings into one activity feed.
  const recentChanges = useMemo<RecentChange[]>(() => {
    const noteChanges: RecentChange[] = notes
      .filter((n) => n.type === "file" && n.lastModified)
      .map((n) => ({
        key: `note:${n.path}`,
        kind: "note" as const,
        title: n.name.replace(/\.(md|markdown|txt|canvas)$/i, ""),
        ts: new Date(n.lastModified as string).getTime(),
        href: `/notes?path=${encodeURIComponent(n.path)}`,
      }));

    const recordingChanges: RecentChange[] = recordings.map((r) => ({
      key: `rec:${r.id}`,
      kind: "recording" as const,
      title: r.title,
      ts: new Date(r.recordedAt).getTime(),
      href: "/notes?tab=recordings",
      source: r.source,
      processing: r.status === "pending" || r.status === "processing",
    }));

    return [...noteChanges, ...recordingChanges]
      .filter((c) => Number.isFinite(c.ts))
      .sort((a, b) => b.ts - a.ts)
      .slice(0, 16);
  }, [notes, recordings]);

  return {
    loading,
    events,
    upcoming,
    todayEvents,
    nextEvent: upcoming[0] ?? null,
    openTasks,
    dueToday,
    recentChanges,
  };
}

export type DashboardData = ReturnType<typeof useDashboardData>;

/* --------------------------------------------------------------- widgets */

/** Tile surface of each section; the grid draws the tile, the widget fills it. */
export const WIDGET_SURFACE: Partial<Record<WidgetType, string>> = {
  "next-up": "tile-ink",
  today: "tile-tint",
};

interface WidgetProps {
  data: DashboardData;
  /** The format's id (see WIDGETS in lib/dashboard/layout). */
  preset: string;
  opts: WidgetOptions;
  /** Change this section's options from the section itself (saved at once). */
  setOpts?: (opts: WidgetOptions) => void;
}

export function RenderWidget({
  type,
  ...props
}: WidgetProps & { type: WidgetType }) {
  const t = useT();
  switch (type) {
    case "next-up":
      return <NextUpWidget {...props} />;
    case "today":
      return <TodayWidget {...props} />;
    case "month":
      return (
        <MonthWidget
          events={props.data.events}
          tasks={props.data.openTasks}
          preset={props.preset}
          opts={props.opts}
        />
      );
    case "shortcuts":
      return <ShortcutsWidget {...props} />;
    case "news":
      return <NewsTile embedded unreadOnly={props.opts.unreadOnly === true} />;
    case "tasks":
      return <TasksWidget {...props} />;
    case "dossier":
      return <DossierWidget {...props} />;
    case "schedule":
      return (
        <Titled title={t("dashboard.sections.schedule")}>
          <ScheduleList
            events={scheduleEvents(props.data, String(props.opts.range))}
            byDay={props.opts.range !== "today"}
            calendar={
              props.opts.calendar !== false && props.preset !== "column"
            }
            layout={props.preset}
          />
        </Titled>
      );
    case "projects":
      return (
        <Titled title={t("dashboard.sections.projects")}>
          <div className="pt-4">
            <ProjectLauncher
              top={Number(props.opts.top) || 4}
              description={
                props.opts.description !== false && props.preset !== "column"
              }
              columns={props.preset === "wide"}
              footer={false}
            />
          </div>
        </Titled>
      );
    case "recent":
      return (
        <Titled title={t("dashboard.sections.recent")}>
          <RecentList
            items={recentOf(props.data, String(props.opts.kind))}
            layout={props.preset}
          />
        </Titled>
      );
    case "machines":
      return <MachinesWidget {...props} />;
    case "quick-links":
      return <QuickLinksWidget {...props} />;
    case "sticky":
      return <StickyNotesWidget preset={props.preset} />;
  }
}

export const renderWidget = (type: WidgetType, props: WidgetProps) => (
  <RenderWidget type={type} {...props} />
);

function Titled({
  title,
  href,
  children,
}: {
  title: string;
  href?: string;
  children: ReactNode;
}) {
  const t = useT();
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-3">
        <p className="etiquette">{title}</p>
        {href && (
          <Link
            href={href}
            className="text-[12px] font-medium text-muted-foreground hover:text-foreground"
          >
            {t("dashboard.sections.viewAll")}
          </Link>
        )}
      </div>
      <div className="filet mt-4 shrink-0" />
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}

/* ---------------------------------------------------------------- next up */

function NextUpWidget({ data, preset, opts }: WidgetProps) {
  const t = useT();
  const next = data.nextEvent;
  const after = data.upcoming.slice(1, 1 + Number(opts.after || 0));
  const place =
    opts.location !== false && next
      ? [next.location, next.feed?.name].filter(Boolean).join(" · ")
      : "";

  const empty = (
    <>
      <p className="voice mt-4 text-[24px] text-background md:text-[28px]">
        {t("dashboard.nextUp.empty")}
      </p>
      {preset !== "strip" && (
        <p className="mt-2 text-[14px] text-background/70">
          {t("dashboard.nextUp.emptyHint")}
        </p>
      )}
    </>
  );

  const afterList = after.length > 0 && (
    <ul className="mt-4 space-y-1.5 border-t border-background/15 pt-3">
      {after.map((e) => (
        <li
          key={e.id}
          className="flex items-baseline gap-3 text-[13px] text-background/75"
        >
          <span className="w-28 shrink-0 tabular-nums text-background/55">
            {isToday(e.start)
              ? e.allDay
                ? t("dashboard.schedule.allDay")
                : timeLabel(e.start)
              : `${new Date(e.start).toLocaleDateString(undefined, {
                  weekday: "short",
                })}${e.allDay ? "" : ` · ${timeLabel(e.start)}`}`}
          </span>
          <span className="truncate">{e.title}</span>
        </li>
      ))}
    </ul>
  );

  if (preset === "strip") {
    return (
      <div className="flex h-full items-center gap-6">
        <div className="min-w-0 flex-1">
          <p className="etiquette text-background/60">
            {next
              ? `${t("dashboard.nextUp.title")} · ${whenLabel(t, next)}`
              : t("dashboard.nextUp.title")}
          </p>
          {next ? (
            <p className="voice event-title mt-3 truncate text-[24px] text-background md:text-[28px]">
              {next.title}
              {place && (
                <span className="ml-3 font-sans text-[14px] text-background/60">
                  {place}
                </span>
              )}
            </p>
          ) : (
            empty
          )}
        </div>
        {after.length > 0 && (
          <ul className="hidden shrink-0 gap-2 xl:flex">
            {after.map((e) => (
              <li
                key={e.id}
                className="max-w-[11rem] rounded-full bg-background/10 px-3 py-1.5 text-[12px] text-background/80"
              >
                <span className="block truncate">
                  <span className="tabular-nums text-background/55">
                    {e.allDay ? "—" : timeLabel(e.start)}
                  </span>{" "}
                  {e.title}
                </span>
              </li>
            ))}
          </ul>
        )}
        <Button variant="inverse" className="hidden shrink-0 sm:flex" asChild>
          <Link href="/calendar">{t("dashboard.nextUp.openCalendar")}</Link>
        </Button>
      </div>
    );
  }

  if (preset === "compact") {
    return (
      <Link href="/calendar" className="group flex h-full flex-col">
        <p className="etiquette text-background/60">
          {t("dashboard.nextUp.title")}
        </p>
        {next ? (
          <>
            <p className="mt-4 text-[34px] font-extrabold leading-none tracking-[-0.02em] text-background">
              {next.allDay
                ? t("dashboard.schedule.allDay")
                : timeLabel(next.start)}
            </p>
            <p className="mt-1 text-[12px] capitalize text-background/60">
              {isToday(next.start)
                ? t("dashboard.nextUp.today")
                : new Date(next.start).toLocaleDateString(undefined, {
                    weekday: "long",
                    day: "numeric",
                  })}
            </p>
            <p className="voice event-title mt-4 line-clamp-3 text-[19px] text-background">
              {next.title}
            </p>
            {place && (
              <p className="mt-2 truncate text-[12px] text-background/60">
                {place}
              </p>
            )}
          </>
        ) : (
          <p className="voice mt-4 text-[20px] text-background">
            {t("dashboard.nextUp.empty")}
          </p>
        )}
        <span className="mt-auto flex h-9 w-9 items-center justify-center self-end rounded-full bg-background text-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5">
          <ArrowUpRight className="h-4 w-4" />
        </span>
      </Link>
    );
  }

  // hero (3×2) and square (2×2): stacked, the button at the bottom.
  const square = preset === "square";
  return (
    <div
      className={cn(
        "flex h-full flex-col justify-between gap-5",
        !square && "md:flex-row md:items-end"
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="etiquette text-background/60">
          {next
            ? `${t("dashboard.nextUp.title")} · ${whenLabel(t, next)}`
            : t("dashboard.nextUp.title")}
        </p>
        {next ? (
          <>
            <p
              className={cn(
                "voice event-title mt-5 line-clamp-3 text-background",
                square ? "text-[24px]" : "text-[26px] md:text-[30px]"
              )}
            >
              {next.title}
            </p>
            {place && (
              <p className="event-location mt-3 max-w-xl truncate text-[15px] text-background/70">
                {place}
              </p>
            )}
          </>
        ) : (
          empty
        )}
        {afterList}
      </div>
      <Button
        variant="inverse"
        size={square ? "default" : "lg"}
        className="shrink-0 self-start md:self-auto"
        asChild
      >
        <Link href="/calendar">{t("dashboard.nextUp.openCalendar")}</Link>
      </Button>
    </div>
  );
}

/* ------------------------------------------------------------------ today */

function TodayWidget({ data, preset, opts }: WidgetProps) {
  const t = useT();
  const now = new Date();
  const { dueToday, todayEvents } = data;
  const date = now.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  const weekday = now.toLocaleDateString(undefined, { weekday: "long" });
  const line = (
    <p className="mt-3 text-[13px] capitalize">
      {weekday}
      {opts.week !== false &&
        ` · ${t("dashboard.today.week", { count: isoWeek(now) })}`}
    </p>
  );
  const due = opts.due !== false && (
    <p className="mt-1 font-serif text-[15px] italic leading-[1.3] text-tint-foreground/75">
      {dueToday === 0
        ? t("dashboard.today.nothingDue")
        : t(
            dueToday > 1
              ? "dashboard.today.dueTasksPlural"
              : "dashboard.today.dueTasks",
            { count: dueToday }
          )}
    </p>
  );

  if (preset === "mini") {
    return (
      <div className="flex h-full flex-col justify-center">
        <p className="text-[34px] font-extrabold leading-none tracking-[-0.02em]">
          {date}
        </p>
        <p className="mt-2 text-[12px] capitalize text-tint-foreground/70">
          {weekday}
          {opts.week !== false &&
            ` · ${t("dashboard.today.weekShort", { count: isoWeek(now) })}`}
        </p>
      </div>
    );
  }

  if (preset === "wide") {
    return (
      <div className="flex h-full min-h-0 gap-6">
        <div className="shrink-0">
          <p className="etiquette text-tint-foreground/60">
            {t("dashboard.today.title")}
          </p>
          <p className="mt-7 text-[48px] font-extrabold leading-none tracking-[-0.02em]">
            {date}
          </p>
          {line}
          {due}
        </div>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col border-l border-tint-foreground/15 pl-6">
          <p className="etiquette text-tint-foreground/60">
            {todayEvents.length === 0
              ? t("dashboard.today.noEvents")
              : t(
                  todayEvents.length > 1
                    ? "dashboard.today.eventsPlural"
                    : "dashboard.today.events",
                  { count: todayEvents.length }
                )}
          </p>
          <ul className="mt-4 min-h-0 flex-1 space-y-2.5 overflow-y-auto">
            {todayEvents.map((e) => (
              <li key={e.id} className="flex items-baseline gap-3 text-[14px]">
                <span className="w-[4.5rem] shrink-0 whitespace-nowrap tabular-nums text-tint-foreground/60">
                  {e.allDay
                    ? t("dashboard.schedule.allDay")
                    : timeLabel(e.start)}
                </span>
                <span className="truncate font-medium">{e.title}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  return (
    <div>
      <p className="etiquette text-tint-foreground/60">
        {t("dashboard.today.title")}
      </p>
      <p className="mt-7 text-[40px] font-extrabold leading-none tracking-[-0.02em]">
        {date}
      </p>
      {line}
      {due}
    </div>
  );
}

/* ------------------------------------------------------------------ tasks */

function TasksWidget({ data, preset, opts }: WidgetProps) {
  const t = useT();
  const week = endOfDay(addDays(new Date(), 7)).getTime();
  const filtered = data.openTasks.filter((task) =>
    opts.filter === "active"
      ? task.status === "in_progress"
      : opts.filter === "soon"
        ? !!task.dueDate && new Date(task.dueDate).getTime() <= week
        : true
  );
  const limit = opts.limit === "all" ? Infinity : Number(opts.limit) || 10;
  const shown = filtered.slice(0, preset === "compact" ? 3 : limit);
  const showDue = opts.due !== false;
  const label =
    opts.filter === "active"
      ? t("dashboard.tasks.inProgress")
      : opts.filter === "soon"
        ? t("dashboard.tasks.dueThisWeek")
        : t("dashboard.tasks.openTasks");

  if (preset === "compact") {
    return (
      <Link href="/tasks" className="flex h-full min-h-0 flex-col">
        <p className="etiquette">{label}</p>
        <p className="mt-4 text-[44px] font-extrabold leading-none tracking-[-0.02em]">
          {filtered.length}
        </p>
        <ul className="mt-4 min-h-0 space-y-1.5 overflow-hidden">
          {shown.map((task) => (
            <li
              key={task.id}
              className="task-title truncate text-[13px] text-foreground/80"
            >
              {task.title}
            </li>
          ))}
        </ul>
      </Link>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-3">
        <p className="etiquette">{label}</p>
        {filtered.length > 0 && (
          <span className="text-[12px] tabular-nums text-muted-foreground">
            {filtered.length}
          </span>
        )}
      </div>
      {filtered.length === 0 ? (
        <Empty
          title={t("dashboard.tasks.emptyTitle")}
          hint={t("dashboard.tasks.emptyHint")}
        />
      ) : (
        <ol
          className={cn(
            "-mx-1 mt-3 min-h-0 flex-1 overflow-y-auto px-1",
            preset === "wide" && "gap-x-10 md:columns-2"
          )}
        >
          {shown.map((task, i) => {
            const due =
              showDue && task.dueDate ? relativeDue(t, task.dueDate) : null;
            const active = task.status === "in_progress";
            return (
              <li
                key={task.id}
                className={cn(
                  "break-inside-avoid border-b border-border last:border-b-0",
                  active && "my-1.5 rounded-chip border-b-0 bg-tint-soft px-2.5"
                )}
              >
                <Link href="/tasks" className="flex items-baseline gap-3 py-3">
                  <span
                    className={cn("rangee-num", active && "text-foreground/60")}
                  >
                    {pad(i + 1)}
                  </span>
                  <span
                    className={cn(
                      "task-title min-w-0 flex-1 truncate text-[15px]",
                      active
                        ? "font-semibold tracking-title text-foreground"
                        : "text-foreground/85"
                    )}
                  >
                    {task.title}
                  </span>
                  {due && (
                    <Badge
                      variant={due.tone}
                      className="shrink-0 px-2.5 py-0.5 text-[11px]"
                    >
                      {due.label}
                    </Badge>
                  )}
                </Link>
              </li>
            );
          })}
        </ol>
      )}
      <div className="mt-4 flex items-center gap-3">
        <Button variant="outline" size="sm" asChild>
          <Link href="/tasks">{t("dashboard.tasks.all")}</Link>
        </Button>
        {filtered.length > shown.length && (
          <span className="text-[12px] text-muted-foreground">
            +{filtered.length - shown.length}
          </span>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- dossier */

function DossierWidget({ data, preset, opts }: WidgetProps) {
  const t = useT();
  const wide = preset !== "half";
  return (
    <Tabs
      defaultValue={String(opts.tab || "schedule")}
      className="flex h-full min-h-0 flex-col"
    >
      <TabsList className="w-full max-w-[520px] shrink-0">
        <TabsTrigger value="schedule">
          {t("dashboard.sections.schedule")}
        </TabsTrigger>
        <TabsTrigger value="projects">
          {t("dashboard.sections.projects")}
        </TabsTrigger>
        <TabsTrigger value="recent">
          {t("dashboard.sections.recent")}
        </TabsTrigger>
      </TabsList>
      <div className="filet mt-5 shrink-0" />
      <TabsContent
        value="schedule"
        className="mt-0 min-h-0 flex-1 overflow-y-auto data-[state=inactive]:hidden"
      >
        <ScheduleList
          events={data.todayEvents}
          byDay={false}
          calendar={wide}
          layout="list"
        />
      </TabsContent>
      <TabsContent
        value="projects"
        className="mt-0 min-h-0 flex-1 overflow-y-auto pt-5 data-[state=inactive]:hidden"
      >
        <ProjectLauncher columns={preset === "wide"} />
      </TabsContent>
      <TabsContent
        value="recent"
        className="mt-0 min-h-0 flex-1 overflow-y-auto data-[state=inactive]:hidden"
      >
        <RecentList
          items={data.recentChanges.slice(0, 8)}
          layout={wide ? "list" : "column"}
        />
      </TabsContent>
    </Tabs>
  );
}

/* --------------------------------------------------------------- schedule */

function scheduleEvents(data: DashboardData, range: string) {
  if (range === "today") return data.todayEvents;
  const to = endOfDay(addDays(new Date(), range === "3d" ? 2 : 6)).getTime();
  const from = startOfDay(new Date()).getTime();
  return data.upcoming.filter((e) => {
    const s = new Date(e.start).getTime();
    return s <= to && new Date(e.end).getTime() >= from;
  });
}

const dayHeading = (t: TranslateFn, iso: string) => {
  const d = startOfDay(new Date(iso));
  const diff = Math.round(
    (d.getTime() - startOfDay(new Date()).getTime()) / 86_400_000
  );
  if (diff <= 0) return t("dashboard.schedule.day.today");
  if (diff === 1) return t("dashboard.schedule.day.tomorrow");
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
};

function ScheduleList({
  events,
  byDay,
  calendar,
  layout,
}: {
  events: EventItem[];
  byDay: boolean;
  calendar: boolean;
  /** list | column | wide */
  layout: string;
}) {
  const t = useT();
  if (events.length === 0)
    return (
      <Empty
        title={t("dashboard.schedule.emptyTitle")}
        hint={t("dashboard.schedule.emptyHint")}
      />
    );

  const groups: { day: string; items: EventItem[] }[] = [];
  for (const e of events) {
    const day = byDay ? dayHeading(t, e.start) : "";
    const g = groups[groups.length - 1];
    if (g && g.day === day) g.items.push(e);
    else groups.push({ day, items: [e] });
  }

  const column = layout === "column";
  return (
    <div className={cn(layout === "wide" && "gap-x-10 md:columns-2")}>
      {groups.map((g) => (
        <section key={g.day || "all"} className="break-inside-avoid">
          {byDay && <p className="etiquette pb-1 pt-5 capitalize">{g.day}</p>}
          <ol>
            {g.items.map((e, i) =>
              column ? (
                <li
                  key={e.id}
                  className="border-b border-border py-3 last:border-b-0"
                >
                  <p className="text-[12px] tabular-nums text-muted-foreground">
                    {e.allDay
                      ? t("dashboard.schedule.allDay")
                      : timeLabel(e.start)}
                  </p>
                  <p className="event-title truncate text-[14px] text-foreground">
                    {e.title}
                  </p>
                </li>
              ) : (
                <li
                  key={e.id}
                  className={cn(
                    "grid grid-cols-[2rem_1fr_auto] items-baseline gap-4 border-b border-border py-4 last:border-b-0",
                    calendar && "sm:grid-cols-[2rem_1fr_9rem_5rem]"
                  )}
                >
                  <span className="rangee-num">{pad(i + 1)}</span>
                  <div className="min-w-0">
                    <p className="event-title truncate text-[15px] text-foreground">
                      {e.title}
                    </p>
                    {e.location && (
                      <p className="event-location truncate text-[13px] text-muted-foreground">
                        {e.location}
                      </p>
                    )}
                  </div>
                  <span
                    className={cn(
                      "calendar-name hidden min-w-0 items-center gap-2 truncate text-[13px] text-muted-foreground",
                      calendar && "sm:flex"
                    )}
                  >
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{
                        backgroundColor:
                          e.feed?.color ?? "hsl(var(--tint-400))",
                      }}
                    />
                    <span className="truncate">{e.feed?.name ?? "—"}</span>
                  </span>
                  <span className="text-right text-[13px] tabular-nums text-muted-foreground">
                    {e.allDay
                      ? t("dashboard.schedule.allDay")
                      : timeLabel(e.start)}
                  </span>
                </li>
              )
            )}
          </ol>
        </section>
      ))}
    </div>
  );
}

/* ----------------------------------------------------------------- recent */

const recentOf = (data: DashboardData, kind: string) =>
  data.recentChanges
    .filter((c) => kind === "all" || c.kind === kind)
    .slice(0, 12);

function RecentList({
  items,
  layout,
}: {
  items: RecentChange[];
  /** list | column | wide */
  layout: string;
}) {
  const t = useT();
  if (items.length === 0)
    return (
      <Empty
        title={t("dashboard.recent.emptyTitle")}
        hint={t("dashboard.recent.emptyHint")}
      />
    );
  const column = layout === "column";
  return (
    <ol className={cn(layout === "wide" && "gap-x-10 md:columns-2")}>
      {items.map((c, i) => {
        const Icon =
          c.kind === "note" ? FileText : recSourceIcon(c.source ?? "");
        return (
          <li
            key={c.key}
            className="break-inside-avoid border-b border-border last:border-b-0"
          >
            <Link
              href={c.href}
              className={cn(
                "grid items-center gap-3 py-3.5",
                column
                  ? "grid-cols-[1rem_1fr]"
                  : "grid-cols-[2rem_1fr_auto] gap-4"
              )}
            >
              {column ? (
                <Icon className="h-4 w-4 text-muted-foreground" />
              ) : (
                <span className="rangee-num">{pad(i + 1)}</span>
              )}
              <span className="min-w-0">
                <span className="flex min-w-0 items-center gap-2.5">
                  {!column && (
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <span
                    className={cn(
                      "truncate text-foreground",
                      column ? "text-[14px]" : "text-[15px]"
                    )}
                  >
                    {c.title}
                  </span>
                  {c.processing && (
                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
                  )}
                </span>
                {column && (
                  <span className="block text-[12px] text-muted-foreground">
                    {timeAgo(t, c.ts)}
                  </span>
                )}
              </span>
              {!column && (
                <span className="text-[13px] text-muted-foreground">
                  <span className="hidden sm:inline">
                    {c.kind === "note"
                      ? t("dashboard.recent.note")
                      : t("dashboard.recent.recording")}{" "}
                    ·{" "}
                  </span>
                  {timeAgo(t, c.ts)}
                </span>
              )}
            </Link>
          </li>
        );
      })}
    </ol>
  );
}

/* -------------------------------------------------------------- shortcuts */

/** « Raccourcis »: the account menu's launch buttons, big enough to tap. */
function ShortcutsWidget({ preset, opts }: WidgetProps) {
  const t = useT();
  const { items, loaded, set } = useLaunchers();
  const manage = () => set({ manageOpen: true });
  const showMachine = opts.machine !== false;
  const showAdd = opts.add !== false;
  const machineOf = (l: (typeof items)[number]) =>
    l.machine?.label || l.machine?.name || t("dashboard.shortcuts.noMachine");

  const header = (
    <div className="flex items-center justify-between gap-3">
      <p className="etiquette">{t("dashboard.shortcuts.title")}</p>
      {items.length > 0 && (
        <button
          type="button"
          onClick={manage}
          className="text-[12px] font-medium text-muted-foreground hover:text-foreground"
        >
          {t("dashboard.shortcuts.manage")}
        </button>
      )}
    </div>
  );

  if (!loaded)
    return (
      <div className="flex h-full flex-col">
        {header}
        <div className="mt-4 flex gap-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-[4.5rem] w-28 animate-pulse rounded-2xl bg-secondary"
            />
          ))}
        </div>
      </div>
    );

  if (items.length === 0)
    return (
      <div className="flex h-full min-h-0 flex-col">
        {header}
        <div className="flex flex-1 flex-wrap items-center justify-between gap-3 pt-3">
          <p className="max-w-md text-[13px] text-muted-foreground">
            {t("dashboard.shortcuts.emptyHint")}
          </p>
          <Button variant="outline" size="sm" onClick={manage}>
            <Plus className="h-4 w-4" />
            {t("dashboard.shortcuts.create")}
          </Button>
        </div>
      </div>
    );

  if (preset === "column") {
    return (
      <div className="flex h-full min-h-0 flex-col">
        {header}
        <ul className="-mx-2 mt-3 min-h-0 flex-1 space-y-1 overflow-y-auto">
          {items.map((l) => (
            <li key={l.id}>
              <button
                type="button"
                onClick={() => runLauncher(l)}
                className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-secondary"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-secondary">
                  <LauncherIcon icon={l.icon} className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[14px] font-semibold tracking-title">
                    {l.label}
                  </span>
                  {showMachine && (
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {machineOf(l)}
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
          {showAdd && (
            <li>
              <button
                type="button"
                onClick={manage}
                className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left text-[13px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-dashed border-border">
                  <Plus className="h-4 w-4" />
                </span>
                {t("common.new")}
              </button>
            </li>
          )}
        </ul>
      </div>
    );
  }

  const pad_ = preset === "pad";
  const button = (l: (typeof items)[number]) => (
    <button
      key={l.id}
      type="button"
      onClick={() => runLauncher(l)}
      title={`${l.label} · ${machineOf(l)}`}
      className={cn(
        "group flex rounded-2xl bg-secondary transition-colors hover:bg-border/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        pad_
          ? "flex-col items-center justify-center gap-2 p-3 text-center"
          : "h-[4.25rem] w-[8.5rem] shrink-0 flex-col items-start justify-between px-3 py-2.5 text-left"
      )}
    >
      <LauncherIcon
        icon={l.icon}
        className={cn(
          "transition-transform group-active:scale-90",
          pad_ ? "h-6 w-6" : "h-[18px] w-[18px]"
        )}
      />
      <span className="w-full min-w-0">
        <span className="block truncate text-[13px] font-semibold leading-tight tracking-title">
          {l.label}
        </span>
        {showMachine && (
          <span className="block truncate text-[11px] leading-tight text-muted-foreground">
            {machineOf(l)}
          </span>
        )}
      </span>
    </button>
  );
  const add = showAdd && (
    <button
      type="button"
      onClick={manage}
      aria-label={t("dashboard.shortcuts.newAria")}
      className={cn(
        "flex items-center justify-center rounded-2xl border border-dashed border-border text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground",
        !pad_ && "h-[4.25rem] w-14 shrink-0"
      )}
    >
      <Plus className="h-5 w-5" />
    </button>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      {header}
      {pad_ ? (
        <div className="mt-4 grid min-h-0 flex-1 auto-rows-[minmax(5.5rem,1fr)] grid-cols-3 gap-2 overflow-y-auto">
          {items.map(button)}
          {add}
        </div>
      ) : (
        // row / half: one line that scrolls sideways.
        <div className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]">
          {items.map(button)}
          {add}
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- machines */

function MachinesWidget({ preset, opts }: WidgetProps) {
  const t = useT();
  const { machines: rows } = useMachineStatus(10000);
  if (preset === "strip" || preset === "half") {
    return (
      <MachinesStatus embedded hideUnmonitored={opts.unmonitored === false} />
    );
  }
  const machines = (rows ?? [])
    .filter((m) => opts.unmonitored !== false || m.stats)
    .sort((a, b) => Number(!a.stats) - Number(!b.stats));
  const grid = preset === "grid";
  return (
    <Titled title={t("dashboard.sections.machines")} href="/machines">
      {rows === null ? (
        <p className="py-6 text-[13px] text-muted-foreground">
          {t("common.loading")}
        </p>
      ) : (
        <ul
          className={cn("mt-3", grid ? "grid grid-cols-2 gap-2" : "space-y-1")}
        >
          {machines.map((m) => (
            <li key={m.id}>
              <Link
                href="/machines"
                className={cn(
                  "flex items-center gap-2.5 rounded-xl transition-colors hover:bg-secondary",
                  grid ? "bg-secondary/60 p-3" : "px-1 py-2"
                )}
              >
                <StatusDot health={machineHealth(m.stats).health} />
                <span className="min-w-0">
                  <span className="block truncate text-[14px] font-semibold tracking-title">
                    {m.label || m.name}
                  </span>
                  <span className="block truncate text-[12px] tabular-nums text-muted-foreground">
                    {machineNote(t, m)}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Titled>
  );
}

/* ------------------------------------------------------------ quick links */

const QUICK_LINKS: Record<
  (typeof QUICK_LINK_IDS)[number],
  { href: string; labelKey: string; icon: typeof Calendar }
> = {
  calendar: {
    href: "/calendar",
    labelKey: "dashboard.quickLinks.calendar",
    icon: Calendar,
  },
  tasks: {
    href: "/tasks",
    labelKey: "dashboard.quickLinks.tasks",
    icon: ListTodo,
  },
  focus: {
    href: "/focus",
    labelKey: "dashboard.quickLinks.focus",
    icon: Target,
  },
  email: {
    href: "/email",
    labelKey: "dashboard.quickLinks.email",
    icon: Mail,
  },
  notes: {
    href: "/notes",
    labelKey: "dashboard.quickLinks.notes",
    icon: NotebookPen,
  },
  projets: {
    href: "/projets",
    labelKey: "dashboard.quickLinks.projets",
    icon: FolderGit2,
  },
  contacts: {
    href: "/contacts",
    labelKey: "dashboard.quickLinks.contacts",
    icon: Users,
  },
  machines: {
    href: "/machines",
    labelKey: "dashboard.quickLinks.machines",
    icon: Monitor,
  },
  fiscalite: {
    href: "/fiscalite",
    labelKey: "dashboard.quickLinks.fiscalite",
    icon: Receipt,
  },
  settings: {
    href: "/settings",
    labelKey: "dashboard.quickLinks.settings",
    icon: Settings,
  },
};

type QuickItem = {
  key: string;
  href: string;
  label: string;
  external: boolean;
  mark: (cls: string) => ReactNode;
};

/** Next's Link for pages inside DreamDash, a new tab for everything else. */
function QuickLinkAnchor({
  item,
  className,
  children,
}: {
  item: QuickItem;
  className: string;
  children: ReactNode;
}) {
  return item.external ? (
    <a
      href={item.href}
      target="_blank"
      rel="noopener noreferrer"
      title={item.label}
      className={className}
    >
      {children}
    </a>
  ) : (
    <Link href={item.href} title={item.label} className={className}>
      {children}
    </Link>
  );
}

function QuickLinksWidget({ preset, opts, setOpts }: WidgetProps) {
  const t = useT();
  const [editorOpen, setEditorOpen] = useState(false);
  const chosen = Array.isArray(opts.links) ? opts.links : [...QUICK_LINK_IDS];
  const custom = (
    Array.isArray(opts.custom) ? opts.custom : []
  ) as CustomLink[];

  const items: QuickItem[] = [
    ...QUICK_LINK_IDS.filter((id) => (chosen as string[]).includes(id)).map(
      (id) => {
        const { href, labelKey, icon: Icon } = QUICK_LINKS[id];
        return {
          key: id,
          href,
          label: t(labelKey),
          external: false,
          mark: (cls: string) => <Icon className={cls} />,
        };
      }
    ),
    ...custom.map((l) => ({
      key: l.id,
      href: l.url,
      label: l.label,
      external: !l.url.startsWith("/"),
      mark: (cls: string) => <CustomLinkMark link={l} className={cls} />,
    })),
  ];

  const editor = setOpts && (
    <QuickLinksEditor
      open={editorOpen}
      onOpenChange={setEditorOpen}
      links={custom}
      onChange={(next) => setOpts({ ...opts, custom: next })}
    />
  );
  const addButton = (cls: string, children?: ReactNode) =>
    setOpts && (
      <button
        type="button"
        onClick={() => setEditorOpen(true)}
        aria-label={t("dashboard.quickLinks.addAria")}
        title={t("dashboard.quickLinks.addAria")}
        className={cn(
          "flex items-center justify-center gap-2 border border-dashed border-border text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground",
          cls
        )}
      >
        <Plus className="h-4 w-4 shrink-0" />
        {children}
      </button>
    );

  const header = (
    <p className="etiquette">{t("dashboard.quickLinks.title")}</p>
  );

  if (items.length === 0)
    return (
      <div className="flex h-full min-h-0 flex-col">
        {header}
        <div className="flex flex-1 flex-wrap items-center justify-between gap-3 pt-3">
          <p className="text-[13px] text-muted-foreground">
            {t("dashboard.quickLinks.emptyHint")}
          </p>
          {addButton(
            "h-9 rounded-full px-3.5 text-[13px]",
            t("common.add")
          )}
        </div>
        {editor}
      </div>
    );

  let body: ReactNode;
  if (preset === "icons") {
    body = (
      <div className="mt-4 flex flex-wrap content-start gap-2 overflow-y-auto">
        {items.map((it) => (
          <QuickLinkAnchor
            key={it.key}
            item={it}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-secondary transition-colors hover:bg-foreground hover:text-background"
          >
            {it.mark("h-[18px] w-[18px]")}
            <span className="sr-only">{it.label}</span>
          </QuickLinkAnchor>
        ))}
        {addButton("h-11 w-11 rounded-full")}
      </div>
    );
  } else if (preset === "grid") {
    body = (
      <div className="mt-4 grid min-h-0 flex-1 auto-rows-fr grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-5">
        {items.map((it) => (
          <QuickLinkAnchor
            key={it.key}
            item={it}
            className="flex min-h-[3.75rem] min-w-0 flex-col items-center justify-center gap-1.5 rounded-2xl bg-secondary px-1.5 text-[12px] font-medium transition-colors hover:bg-border/70"
          >
            {it.mark("h-[18px] w-[18px]")}
            <span className="w-full truncate text-center">{it.label}</span>
          </QuickLinkAnchor>
        ))}
        {addButton("min-h-[3.75rem] rounded-2xl")}
      </div>
    );
  } else if (preset === "column") {
    body = (
      <ul className="-mx-2 mt-3 min-h-0 flex-1 overflow-y-auto">
        {items.map((it) => (
          <li key={it.key}>
            <QuickLinkAnchor
              item={it}
              className="flex items-center gap-3 rounded-xl px-2 py-2 text-[14px] font-medium transition-colors hover:bg-secondary"
            >
              {it.mark("h-4 w-4 text-muted-foreground")}
              <span className="truncate">{it.label}</span>
            </QuickLinkAnchor>
          </li>
        ))}
        {setOpts && (
          <li>
            {addButton(
              "mt-1 w-full justify-start rounded-xl border-0 px-2 py-2 text-[13px] hover:bg-secondary",
              t("dashboard.quickLinks.addLink")
            )}
          </li>
        )}
      </ul>
    );
  } else {
    body = (
      <div className="mt-4 flex min-h-0 flex-1 flex-wrap content-start gap-2 overflow-y-auto">
        {items.map((it) => (
          <QuickLinkAnchor
            key={it.key}
            item={it}
            className="flex h-9 max-w-[14rem] items-center gap-2 rounded-full bg-secondary px-3.5 text-[13px] font-medium transition-colors hover:bg-border/70"
          >
            {it.mark("h-4 w-4 text-muted-foreground")}
            <span className="truncate">{it.label}</span>
          </QuickLinkAnchor>
        ))}
        {addButton("h-9 w-9 rounded-full")}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {header}
      {body}
      {editor}
    </div>
  );
}

function Empty({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-10 text-center">
      <p className="text-[15px] font-semibold tracking-title text-foreground">
        {title}
      </p>
      <p className="mt-1 max-w-sm text-[13px] text-muted-foreground">{hint}</p>
    </div>
  );
}
