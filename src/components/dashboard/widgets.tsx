"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";

import Link from "next/link";

import {
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

import { MachinesStatus } from "@/components/dashboard/MachinesStatus";
import { ProjectLauncher } from "@/components/dashboard/ProjectLauncher";
import { LauncherIcon } from "@/components/launchers/LauncherIcon";
import { runLauncher, useLaunchers } from "@/components/launchers/useLaunchers";
import { NewsTile } from "@/components/notifications/NewsTile";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import type { WidgetType } from "@/lib/dashboard/layout";
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

const timeLabel = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });

const relativeDue = (iso: string) => {
  const due = startOfDay(new Date(iso)).getTime();
  const today = startOfDay(new Date()).getTime();
  const days = Math.round((due - today) / 86_400_000);
  if (days < 0)
    return {
      label: `${Math.abs(days)}d overdue`,
      tone: "negative" as const,
    };
  if (days === 0) return { label: "Today", tone: "pending" as const };
  if (days === 1) return { label: "Tomorrow", tone: "default" as const };
  if (days < 7) return { label: `In ${days}d`, tone: "default" as const };
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

const timeAgo = (ts: number) => {
  const diff = Date.now() - ts;
  const min = Math.round(diff / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} h ago`;
  const days = Math.round(hr / 24);
  if (days < 7) return `${days} d ago`;
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

  // The next thing on the calendar — today or later — that hasn't ended yet.
  const nextEvent = useMemo(() => {
    const now = Date.now();
    return (
      [...events]
        .filter((e) => new Date(e.end).getTime() >= now)
        .sort((a, b) => +new Date(a.start) - +new Date(b.start))[0] ?? null
    );
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
      .slice(0, 12);
  }, [notes, recordings]);

  return {
    loading,
    todayEvents,
    nextEvent,
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

/** `w` is the section's width in columns (the lists show more when wide). */
export function renderWidget(type: WidgetType, data: DashboardData, w: number) {
  const wide = w >= 2;
  switch (type) {
    case "next-up":
      return <NextUpWidget data={data} />;
    case "today":
      return <TodayWidget data={data} />;
    case "shortcuts":
      return <ShortcutsWidget />;
    case "news":
      return <NewsTile embedded />;
    case "tasks":
      return <TasksWidget data={data} />;
    case "dossier":
      return <DossierWidget data={data} wide={wide} />;
    case "schedule":
      return (
        <Titled title="Horaire du jour">
          <ScheduleList data={data} wide={wide} />
        </Titled>
      );
    case "projects":
      return (
        <Titled title="Projets">
          <ProjectLauncher />
        </Titled>
      );
    case "recent":
      return (
        <Titled title="Récents">
          <RecentList data={data} wide={wide} />
        </Titled>
      );
    case "machines":
      return <MachinesStatus embedded />;
    case "quick-links":
      return <QuickLinksWidget />;
  }
}

function Titled({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <p className="etiquette">{title}</p>
      <div className="filet mt-4" />
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}

function NextUpWidget({ data }: { data: DashboardData }) {
  const { nextEvent } = data;
  const now = new Date();
  const nextIsToday =
    nextEvent &&
    startOfDay(new Date(nextEvent.start)).getTime() ===
      startOfDay(now).getTime();
  const nextWhen = nextEvent
    ? nextEvent.allDay
      ? nextIsToday
        ? "All day today"
        : new Date(nextEvent.start).toLocaleDateString(undefined, {
            weekday: "long",
            month: "long",
            day: "numeric",
          })
      : `${
          nextIsToday
            ? "Today"
            : new Date(nextEvent.start).toLocaleDateString(undefined, {
                weekday: "long",
              })
        } · ${timeLabel(nextEvent.start)}`
    : null;

  return (
    <div className="flex h-full flex-col justify-between gap-6 md:flex-row md:items-end">
      <div className="min-w-0">
        <p className="etiquette text-background/60">
          {nextEvent ? `Next up · ${nextWhen}` : "Next up"}
        </p>
        {nextEvent ? (
          <>
            <p className="voice event-title mt-5 line-clamp-3 text-[26px] text-background md:text-[30px]">
              {nextEvent.title}
            </p>
            {(nextEvent.location || nextEvent.feed?.name) && (
              <p className="event-location mt-3 max-w-xl truncate text-[15px] text-background/70">
                {[nextEvent.location, nextEvent.feed?.name]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}
          </>
        ) : (
          <>
            <p className="voice mt-5 text-[26px] text-background md:text-[30px]">
              Nothing on the calendar.
            </p>
            <p className="mt-3 text-[15px] text-background/70">
              Enjoy the quiet, or plan the next thing.
            </p>
          </>
        )}
      </div>
      <Button variant="inverse" size="lg" className="shrink-0" asChild>
        <Link href="/calendar">Open calendar</Link>
      </Button>
    </div>
  );
}

function TodayWidget({ data }: { data: DashboardData }) {
  const now = new Date();
  const { dueToday } = data;
  return (
    <div>
      <p className="etiquette text-tint-foreground/60">Today</p>
      <p className="mt-7 text-[40px] font-extrabold leading-none tracking-[-0.02em]">
        {now.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
      </p>
      <p className="mt-3 text-[13px] capitalize">
        {now.toLocaleDateString(undefined, { weekday: "long" })} · week{" "}
        {isoWeek(now)}
      </p>
      <p className="mt-1 font-serif text-[15px] italic leading-[1.3] text-tint-foreground/75">
        {dueToday === 0
          ? "Nothing due today."
          : `${dueToday} task${dueToday > 1 ? "s" : ""} due today.`}
      </p>
    </div>
  );
}

function TasksWidget({ data }: { data: DashboardData }) {
  const { openTasks } = data;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-3">
        <p className="etiquette">Open tasks</p>
        {openTasks.length > 0 && (
          <span className="text-[12px] tabular-nums text-muted-foreground">
            {openTasks.length}
          </span>
        )}
      </div>
      {openTasks.length === 0 ? (
        <Empty
          title="No open tasks."
          hint="Anything you add in Tasks shows up here, soonest first."
        />
      ) : (
        <ol className="-mx-1 mt-3 min-h-0 flex-1 overflow-y-auto px-1">
          {openTasks.slice(0, 30).map((t, i) => {
            const due = t.dueDate ? relativeDue(t.dueDate) : null;
            const active = t.status === "in_progress";
            return (
              <li
                key={t.id}
                className={cn(
                  "border-b border-border last:border-b-0",
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
                    {t.title}
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
      <div className="mt-4">
        <Button variant="outline" size="sm" asChild>
          <Link href="/tasks">All tasks</Link>
        </Button>
      </div>
    </div>
  );
}

function DossierWidget({ data, wide }: { data: DashboardData; wide: boolean }) {
  return (
    <Tabs defaultValue="schedule" className="flex h-full min-h-0 flex-col">
      <TabsList className="w-full max-w-[520px] shrink-0">
        <TabsTrigger value="schedule">Schedule</TabsTrigger>
        <TabsTrigger value="projects">Projects</TabsTrigger>
        <TabsTrigger value="recent">Recent</TabsTrigger>
      </TabsList>
      <div className="filet mt-5 shrink-0" />
      <TabsContent
        value="schedule"
        className="mt-0 min-h-0 flex-1 overflow-y-auto data-[state=inactive]:hidden"
      >
        <ScheduleList data={data} wide={wide} />
      </TabsContent>
      <TabsContent
        value="projects"
        className="mt-0 min-h-0 flex-1 overflow-y-auto pt-5 data-[state=inactive]:hidden"
      >
        <ProjectLauncher />
      </TabsContent>
      <TabsContent
        value="recent"
        className="mt-0 min-h-0 flex-1 overflow-y-auto data-[state=inactive]:hidden"
      >
        <RecentList data={data} wide={wide} />
      </TabsContent>
    </Tabs>
  );
}

function ScheduleList({ data, wide }: { data: DashboardData; wide: boolean }) {
  const { todayEvents } = data;
  if (todayEvents.length === 0)
    return (
      <Empty
        title="Nothing scheduled today."
        hint="Events from your calendars appear here in order."
      />
    );
  return (
    <ol>
      {todayEvents.map((e, i) => (
        <li
          key={e.id}
          className={cn(
            "grid grid-cols-[2rem_1fr_auto] items-baseline gap-4 border-b border-border py-4 last:border-b-0",
            wide && "sm:grid-cols-[2rem_1fr_9rem_5rem]"
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
              wide && "sm:flex"
            )}
          >
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{
                backgroundColor: e.feed?.color ?? "hsl(var(--tint-400))",
              }}
            />
            <span className="truncate">{e.feed?.name ?? "—"}</span>
          </span>
          <span className="text-right text-[13px] tabular-nums text-muted-foreground">
            {e.allDay ? "All day" : timeLabel(e.start)}
          </span>
        </li>
      ))}
    </ol>
  );
}

function RecentList({ data, wide }: { data: DashboardData; wide: boolean }) {
  const { recentChanges } = data;
  if (recentChanges.length === 0)
    return (
      <Empty
        title="No recent notes or recordings."
        hint="Notes you edit and meetings you record show up here."
      />
    );
  return (
    <ol>
      {recentChanges.map((c, i) => {
        const Icon =
          c.kind === "note" ? FileText : recSourceIcon(c.source ?? "");
        return (
          <li key={c.key} className="border-b border-border last:border-b-0">
            <Link
              href={c.href}
              className="grid grid-cols-[2rem_1fr_auto] items-center gap-4 py-4"
            >
              <span className="rangee-num">{pad(i + 1)}</span>
              <span className="flex min-w-0 items-center gap-2.5">
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate text-[15px] text-foreground">
                  {c.title}
                </span>
                {c.processing && (
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
                )}
              </span>
              <span className="text-[13px] text-muted-foreground">
                <span className={cn("hidden", wide && "sm:inline")}>
                  {c.kind === "note" ? "Note" : "Recording"} ·{" "}
                </span>
                {timeAgo(c.ts)}
              </span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}

/** « Raccourcis »: the account menu's launch buttons, big enough to tap. */
function ShortcutsWidget() {
  const { items, loaded, set } = useLaunchers();
  const manage = () => set({ manageOpen: true });
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-3">
        <p className="etiquette">Raccourcis</p>
        {items.length > 0 && (
          <button
            type="button"
            onClick={manage}
            className="text-[12px] font-medium text-muted-foreground hover:text-foreground"
          >
            Gérer
          </button>
        )}
      </div>
      {!loaded ? (
        <div className="mt-4 flex gap-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-[4.5rem] w-28 animate-pulse rounded-2xl bg-secondary"
            />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-1 flex-wrap items-center justify-between gap-3 pt-3">
          <p className="max-w-md text-[13px] text-muted-foreground">
            Un raccourci envoie une commande à une machine : ouvrir un projet,
            lancer un script, verrouiller l&apos;écran…
          </p>
          <Button variant="outline" size="sm" onClick={manage}>
            <Plus className="h-4 w-4" />
            Créer un raccourci
          </Button>
        </div>
      ) : (
        <div className="mt-4 grid min-h-0 flex-1 auto-rows-[4.5rem] grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-2 overflow-y-auto">
          {items.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => runLauncher(l)}
              title={`${l.label} · ${l.machine.label || l.machine.name}`}
              className="group flex flex-col items-start justify-between rounded-2xl bg-secondary p-3 text-left transition-colors hover:bg-border/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <LauncherIcon
                icon={l.icon}
                className="h-[18px] w-[18px] transition-transform group-active:scale-90"
              />
              <span className="w-full min-w-0">
                <span className="block truncate text-[13px] font-semibold leading-tight tracking-title">
                  {l.label}
                </span>
                <span className="block truncate text-[11px] leading-tight text-muted-foreground">
                  {l.machine.label || l.machine.name}
                </span>
              </span>
            </button>
          ))}
          <button
            type="button"
            onClick={manage}
            aria-label="Nouveau raccourci"
            className="flex items-center justify-center rounded-2xl border border-dashed border-border text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
          >
            <Plus className="h-5 w-5" />
          </button>
        </div>
      )}
    </div>
  );
}

const QUICK_LINKS = [
  { href: "/calendar", label: "Calendrier", icon: Calendar },
  { href: "/tasks", label: "Tâches", icon: ListTodo },
  { href: "/focus", label: "Focus", icon: Target },
  { href: "/email", label: "Courriel", icon: Mail },
  { href: "/notes", label: "Notes", icon: NotebookPen },
  { href: "/projets", label: "Projets", icon: FolderGit2 },
  { href: "/contacts", label: "Contacts", icon: Users },
  { href: "/machines", label: "Machines", icon: Monitor },
  { href: "/fiscalite", label: "Fiscalité", icon: Receipt },
  { href: "/settings", label: "Réglages", icon: Settings },
];

function QuickLinksWidget() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <p className="etiquette">Accès rapide</p>
      <div className="mt-4 flex min-h-0 flex-1 flex-wrap content-start gap-2 overflow-y-auto">
        {QUICK_LINKS.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex h-9 items-center gap-2 rounded-full bg-secondary px-3.5 text-[13px] font-medium transition-colors hover:bg-border/70"
          >
            <Icon className="h-4 w-4 text-muted-foreground" />
            {label}
          </Link>
        ))}
      </div>
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
