"use client";

import { useEffect, useMemo, useState } from "react";

import { useSession } from "next-auth/react";
import Link from "next/link";

import { AudioLines, FileText, Loader2, Mic, Watch } from "lucide-react";

import { MachinesStatus } from "@/components/dashboard/MachinesStatus";
import { ProjectLauncher } from "@/components/dashboard/ProjectLauncher";
import { NewsTile } from "@/components/notifications/NewsTile";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { cn } from "@/lib/utils";

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

const startOfDay = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};
const endOfDay = (d: Date) => {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
};

const greeting = () => {
  const h = new Date().getHours();
  if (h < 5) return "Still up";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
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

export function DashboardView() {
  const { data: session } = useSession();
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
          fetch("/api/tasks?status=todo&status=in_progress"),
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
      .slice(0, 8);
  }, [notes, recordings]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  const now = new Date();
  const firstName = session?.user?.name?.trim().split(/\s+/)[0];
  const longDate = now.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const shortDate = now.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  const weekday = now.toLocaleDateString(undefined, { weekday: "long" });

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
    <div className="page pb-16 pt-8 md:pt-12">
      {/* ------------------------------------------------------------ Hero */}
      <section>
        <h1 className="display text-[44px] sm:text-[64px] md:text-[80px] lg:text-[96px]">
          {greeting()}
          {firstName ? `, ${firstName}` : ""}.
        </h1>
        <div className="mt-6 flex flex-wrap gap-2">
          <Badge className="px-4 py-2 text-[13px] capitalize">{longDate}</Badge>
          <Badge className="px-4 py-2 text-[13px]">
            {todayEvents.length === 0
              ? "No events today"
              : `${todayEvents.length} event${todayEvents.length > 1 ? "s" : ""} today`}
          </Badge>
          <Badge className="px-4 py-2 text-[13px]">
            {openTasks.length === 0
              ? "Inbox zero"
              : `${openTasks.length} open task${openTasks.length > 1 ? "s" : ""}`}
          </Badge>
        </div>
        <div className="filet mt-8" />
      </section>

      {/* ------------------------------------------------ Next up + Today */}
      <section className="mt-8 grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="tile-ink flex flex-col justify-between gap-8 p-7 md:flex-row md:items-end md:p-10">
          <div className="min-w-0">
            <p className="etiquette text-background/60">
              {nextEvent ? `Next up · ${nextWhen}` : "Next up"}
            </p>
            {nextEvent ? (
              <>
                <p className="voice event-title mt-5 text-[26px] text-background md:text-[30px]">
                  {nextEvent.title}
                </p>
                {(nextEvent.location || nextEvent.feed?.name) && (
                  <p className="event-location mt-3 max-w-xl text-[15px] text-background/70">
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

        <div className="tile-tint p-7 md:p-10">
          <p className="etiquette text-tint-foreground/60">Today</p>
          <p className="mt-7 text-[40px] font-extrabold leading-none tracking-[-0.02em]">
            {shortDate}
          </p>
          <p className="mt-3 text-[13px] capitalize">
            {weekday} · week {isoWeek(now)}
          </p>
          <p className="mt-1 font-serif text-[15px] italic leading-[1.3] text-tint-foreground/75">
            {dueToday === 0
              ? "Nothing due today."
              : `${dueToday} task${dueToday > 1 ? "s" : ""} due today.`}
          </p>
        </div>
      </section>

      {/* ------------------------------------------------------ Nouvelles */}
      <NewsTile />

      {/* ------------------------------------------- Tasks + tabbed dossier */}
      <section className="mt-5 grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
        {/* Open tasks — the "steps" tile */}
        <div className="tile flex flex-col p-7 md:p-10">
          <p className="etiquette">Open tasks</p>
          {openTasks.length === 0 ? (
            <Empty
              title="No open tasks."
              hint="Anything you add in Tasks shows up here, soonest first."
            />
          ) : (
            <ol className="mt-5 flex-1">
              {openTasks.slice(0, 6).map((t, i) => {
                const due = t.dueDate ? relativeDue(t.dueDate) : null;
                const active = t.status === "in_progress";
                return (
                  <li
                    key={t.id}
                    className={cn(
                      "border-b border-border last:border-b-0",
                      active &&
                        "-mx-3.5 my-1.5 rounded-chip border-b-0 bg-tint-soft px-3.5"
                    )}
                  >
                    <Link
                      href="/tasks"
                      className="flex items-baseline gap-3 py-3.5"
                    >
                      <span
                        className={cn(
                          "rangee-num",
                          active && "text-foreground/60"
                        )}
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
          <div className="mt-6">
            <Button variant="outline" size="sm" asChild>
              <Link href="/tasks">All tasks</Link>
            </Button>
          </div>
        </div>

        {/* Dossier tile — segmented tabs */}
        <div className="tile p-7 md:p-10">
          <Tabs defaultValue="schedule">
            <TabsList className="w-full max-w-[520px]">
              <TabsTrigger value="schedule">Schedule</TabsTrigger>
              <TabsTrigger value="projects">Projects</TabsTrigger>
              <TabsTrigger value="recent">Recent</TabsTrigger>
            </TabsList>
            <div className="filet mt-6" />

            <TabsContent value="schedule" className="mt-0">
              {todayEvents.length === 0 ? (
                <Empty
                  title="Nothing scheduled today."
                  hint="Events from your calendars appear here in order."
                />
              ) : (
                <>
                  <div className="hidden grid-cols-[2rem_1fr_9rem_5rem] gap-4 pb-3 pt-5 sm:grid">
                    <span className="etiquette">#</span>
                    <span className="etiquette">Event</span>
                    <span className="etiquette">Calendar</span>
                    <span className="etiquette text-right">Time</span>
                  </div>
                  <ol>
                    {todayEvents.map((e, i) => (
                      <li
                        key={e.id}
                        className="grid grid-cols-[2rem_1fr_auto] items-baseline gap-4 border-b border-border py-4 last:border-b-0 sm:grid-cols-[2rem_1fr_9rem_5rem]"
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
                        <span className="calendar-name hidden min-w-0 items-center gap-2 truncate text-[13px] text-muted-foreground sm:flex">
                          <span
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{
                              backgroundColor:
                                e.feed?.color ?? "hsl(var(--tint-400))",
                            }}
                          />
                          <span className="truncate">
                            {e.feed?.name ?? "—"}
                          </span>
                        </span>
                        <span className="text-right text-[13px] tabular-nums text-muted-foreground">
                          {e.allDay ? "All day" : timeLabel(e.start)}
                        </span>
                      </li>
                    ))}
                  </ol>
                </>
              )}
            </TabsContent>

            <TabsContent value="projects" className="mt-6">
              <ProjectLauncher />
            </TabsContent>

            <TabsContent value="recent" className="mt-0">
              {recentChanges.length === 0 ? (
                <Empty
                  title="No recent notes or recordings."
                  hint="Notes you edit and meetings you record show up here."
                />
              ) : (
                <ol>
                  {recentChanges.map((c, i) => {
                    const Icon =
                      c.kind === "note"
                        ? FileText
                        : recSourceIcon(c.source ?? "");
                    return (
                      <li
                        key={c.key}
                        className="border-b border-border last:border-b-0"
                      >
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
                            {c.kind === "note" ? "Note" : "Recording"} ·{" "}
                            {timeAgo(c.ts)}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ol>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </section>

      {/* ------------------------------------------------------- Machines */}
      <MachinesStatus />
    </div>
  );
}

function Empty({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-12 text-center">
      <p className="text-[15px] font-semibold tracking-title text-foreground">
        {title}
      </p>
      <p className="mt-1 max-w-sm text-[13px] text-muted-foreground">{hint}</p>
    </div>
  );
}
