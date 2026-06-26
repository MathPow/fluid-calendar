"use client";

import { useEffect, useMemo, useState } from "react";

import Link from "next/link";

import {
  AudioLines,
  CalendarClock,
  CheckSquare,
  ChevronRight,
  Clock,
  FileText,
  History,
  Loader2,
  Mic,
  Watch,
} from "lucide-react";

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
  if (days < 0) return { label: `${Math.abs(days)}d overdue`, overdue: true };
  if (days === 0) return { label: "Today", overdue: false };
  if (days === 1) return { label: "Tomorrow", overdue: false };
  if (days < 7) return { label: `${days}d`, overdue: false };
  return {
    label: new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    }),
    overdue: false,
  };
};

const recSourceIcon = (s: string) =>
  s === "watch" ? Watch : s === "meetily" ? Mic : AudioLines;

const timeAgo = (ts: number) => {
  const diff = Date.now() - ts;
  const min = Math.round(diff / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.round(hr / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
};

export function DashboardView() {
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

  const openTasks = useMemo(() => {
    return [...tasks].sort((a, b) => {
      if (!a.dueDate && !b.dueDate) return 0;
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return +new Date(a.dueDate) - +new Date(b.dueDate);
    });
  }, [tasks]);

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
      .slice(0, 6);
  }, [notes, recordings]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  const today = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{greeting()}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{today}</p>
      </div>

      {/* Stat strip */}
      <div className="grid grid-cols-3 gap-4">
        <StatTile
          icon={CalendarClock}
          value={todayEvents.length}
          label="events today"
          href="/calendar"
        />
        <StatTile
          icon={CheckSquare}
          value={openTasks.length}
          label="open tasks"
          href="/tasks"
        />
        <StatTile
          icon={AudioLines}
          value={recordings.length}
          label="recordings"
          href="/notes"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Today's schedule */}
        <Card
          className="lg:col-span-2"
          title="Today's schedule"
          icon={CalendarClock}
          href="/calendar"
        >
          {todayEvents.length === 0 ? (
            <Empty>Nothing scheduled today.</Empty>
          ) : (
            <ul className="divide-y divide-border">
              {todayEvents.map((e) => (
                <li key={e.id} className="flex items-center gap-3 py-2.5">
                  <span
                    className="h-8 w-1 shrink-0 rounded-full"
                    style={{ backgroundColor: e.feed?.color ?? "hsl(var(--primary))" }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{e.title}</p>
                    {e.location && (
                      <p className="truncate text-xs text-muted-foreground">
                        {e.location}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {e.allDay ? "All day" : timeLabel(e.start)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Open tasks */}
        <Card title="Open tasks" icon={CheckSquare} href="/tasks">
          {openTasks.length === 0 ? (
            <Empty>No open tasks. 🎉</Empty>
          ) : (
            <ul className="divide-y divide-border">
              {openTasks.slice(0, 6).map((t) => {
                const due = t.dueDate ? relativeDue(t.dueDate) : null;
                return (
                  <li key={t.id} className="flex items-center gap-2 py-2.5">
                    <span
                      className={cn(
                        "h-1.5 w-1.5 shrink-0 rounded-full",
                        t.status === "in_progress"
                          ? "bg-primary"
                          : "bg-muted-foreground/40"
                      )}
                    />
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {t.title}
                    </span>
                    {due && (
                      <span
                        className={cn(
                          "flex shrink-0 items-center gap-1 text-xs",
                          due.overdue
                            ? "text-destructive"
                            : "text-muted-foreground"
                        )}
                      >
                        <Clock className="h-3 w-3" />
                        {due.label}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      {/* Recent changes — notes + recordings */}
      <Card title="Recent changes" icon={History} href="/notes">
        {recentChanges.length === 0 ? (
          <Empty>No recent notes or recordings yet.</Empty>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {recentChanges.map((c) => {
              const Icon =
                c.kind === "note" ? FileText : recSourceIcon(c.source ?? "");
              return (
                <li key={c.key}>
                  <Link
                    href={c.href}
                    className="flex items-center gap-2.5 rounded-lg border border-border p-2.5 transition-colors hover:border-primary/40"
                  >
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{c.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {c.kind === "note" ? "Note" : "Recording"} ·{" "}
                        {timeAgo(c.ts)}
                      </p>
                    </div>
                    {c.processing && (
                      <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

function StatTile({
  icon: Icon,
  value,
  label,
  href,
}: {
  icon: typeof CheckSquare;
  value: number;
  label: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40"
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-2xl font-bold leading-none">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{label}</p>
      </div>
    </Link>
  );
}

function Card({
  title,
  icon: Icon,
  href,
  className,
  children,
}: {
  title: string;
  icon: typeof CheckSquare;
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "rounded-xl border border-border bg-card p-4",
        className
      )}
    >
      <div className="mb-2 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Icon className="h-4 w-4 text-muted-foreground" />
          {title}
        </h2>
        <Link
          href={href}
          className="flex items-center text-xs text-muted-foreground hover:text-foreground"
        >
          View all <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="py-6 text-center text-sm text-muted-foreground">{children}</p>
  );
}
