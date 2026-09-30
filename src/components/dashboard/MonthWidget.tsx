"use client";

import { useMemo, useState } from "react";

import Link from "next/link";

import { ChevronLeft, ChevronRight } from "lucide-react";

import type { WidgetOptions } from "@/lib/dashboard/layout";
import { cn } from "@/lib/utils";

import { useSettingsStore } from "@/store/settings";

export interface MonthEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  feed?: { name: string; color: string | null };
}
export interface MonthTask {
  id: string;
  title: string;
  dueDate: string | null;
  status: string;
}

const TASK_DOT = "hsl(var(--pending-foreground))";
const EVENT_DOT = "hsl(var(--tint-400))";

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

const sameDay = (a: Date, b: Date) => dayKey(a) === dayKey(b);

/**
 * Days an event marks: all its days when it is all-day or lasts a day or
 * more; otherwise only the day it starts (a late meeting that runs past
 * midnight is not tomorrow's).
 */
function daysOf(e: MonthEvent) {
  const start = new Date(e.start);
  const endMs = new Date(e.end).getTime();
  const long = e.allDay || endMs - start.getTime() >= 86_400_000;
  if (!long) return [start];
  const out: Date[] = [];
  const d = new Date(start);
  d.setHours(0, 0, 0, 0);
  // All-day ends are exclusive.
  const end = new Date(endMs - (e.allDay ? 1 : 0));
  for (let i = 0; i < 62 && d <= end; i++) {
    out.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return out.length ? out : [start];
}

const timeLabel = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });

/**
 * « Mois »: the month as a grid, a dot per calendar (and one for tasks due)
 * on each day that has something; tap a day for its list.
 */
export function MonthWidget({
  events,
  tasks,
  preset,
  opts,
}: {
  events: MonthEvent[];
  tasks: MonthTask[];
  /** compact | split | large */
  preset: string;
  opts: WidgetOptions;
}) {
  const settingsStart = useSettingsStore((s) => s.user.weekStartDay);
  const weekStart =
    (opts.weekStart === "auto" ? settingsStart : opts.weekStart) === "monday"
      ? 1
      : 0;
  const showTasks = opts.tasks !== false;

  const today = new Date();
  const [cursor, setCursor] = useState(
    () => new Date(today.getFullYear(), today.getMonth(), 1)
  );
  const [selected, setSelected] = useState<Date>(today);

  // Day → what happens on it.
  const byDay = useMemo(() => {
    const map = new Map<string, { events: MonthEvent[]; tasks: MonthTask[] }>();
    const at = (d: Date) => {
      const k = dayKey(d);
      if (!map.has(k)) map.set(k, { events: [], tasks: [] });
      return map.get(k)!;
    };
    for (const e of events) for (const d of daysOf(e)) at(d).events.push(e);
    if (showTasks)
      for (const t of tasks)
        if (t.dueDate) at(new Date(t.dueDate)).tasks.push(t);
    for (const v of map.values())
      v.events.sort((a, b) => +new Date(a.start) - +new Date(b.start));
    return map;
  }, [events, tasks, showTasks]);

  // Six rows of seven, starting on the week-start day on or before the 1st.
  const cells = useMemo(() => {
    const first = new Date(cursor);
    const offset = (first.getDay() - weekStart + 7) % 7;
    const start = new Date(first);
    start.setDate(1 - offset);
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [cursor, weekStart]);
  // Drop a sixth row that is entirely next month.
  const rows = cells[35].getMonth() !== cursor.getMonth() ? 5 : 6;

  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Date(2024, 0, 7 + ((i + weekStart) % 7)).toLocaleDateString(undefined, {
      weekday: "narrow",
    })
  );

  const monthLabel = cursor.toLocaleDateString(undefined, {
    month: "long",
    year: cursor.getFullYear() === today.getFullYear() ? undefined : "numeric",
  });
  const shift = (n: number) =>
    setCursor((c) => new Date(c.getFullYear(), c.getMonth() + n, 1));
  const isCurrentMonth =
    cursor.getMonth() === today.getMonth() &&
    cursor.getFullYear() === today.getFullYear();

  const dots = (d: Date) => {
    const day = byDay.get(dayKey(d));
    if (!day) return [];
    const colors = [
      ...new Set(day.events.map((e) => e.feed?.color || EVENT_DOT)),
    ].slice(0, day.tasks.length ? 2 : 3);
    if (day.tasks.length) colors.push(TASK_DOT);
    return colors;
  };

  const large = preset === "large";
  const header = (
    <div className="flex items-center justify-between gap-2">
      <p className="etiquette capitalize">{monthLabel}</p>
      <div className="flex items-center gap-0.5">
        {!isCurrentMonth && (
          <button
            type="button"
            onClick={() => {
              setCursor(new Date(today.getFullYear(), today.getMonth(), 1));
              setSelected(today);
            }}
            className="mr-1 text-[12px] font-medium text-muted-foreground hover:text-foreground"
          >
            Aujourd&apos;hui
          </button>
        )}
        <NavButton label="Mois précédent" onClick={() => shift(-1)}>
          <ChevronLeft className="h-4 w-4" />
        </NavButton>
        <NavButton label="Mois suivant" onClick={() => shift(1)}>
          <ChevronRight className="h-4 w-4" />
        </NavButton>
      </div>
    </div>
  );

  const grid = (
    <div
      className={cn(
        "grid min-h-0 grid-cols-7",
        large
          ? "flex-1 gap-px overflow-hidden rounded-xl bg-border"
          : "gap-y-0.5"
      )}
      style={
        large ? { gridTemplateRows: `auto repeat(${rows}, 1fr)` } : undefined
      }
    >
      {weekdays.map((w, i) => (
        <span
          key={i}
          className={cn(
            "pb-1.5 text-center text-[11px] font-medium uppercase text-muted-foreground",
            large && "bg-card pt-1.5"
          )}
        >
          {w}
        </span>
      ))}
      {cells.slice(0, rows * 7).map((d) => {
        const inMonth = d.getMonth() === cursor.getMonth();
        const isToday = sameDay(d, today);
        const isSel = sameDay(d, selected);
        const day = byDay.get(dayKey(d));
        const ds = dots(d);
        if (large)
          return (
            <button
              key={dayKey(d)}
              type="button"
              onClick={() => setSelected(d)}
              className={cn(
                "flex min-h-0 flex-col items-stretch overflow-hidden bg-card p-1.5 text-left transition-colors hover:bg-secondary/60",
                !inMonth && "bg-card/60 text-muted-foreground/50",
                isSel && "bg-tint-soft"
              )}
            >
              <span
                className={cn(
                  "flex h-6 w-6 items-center justify-center self-start rounded-full text-[12px] font-semibold tabular-nums",
                  isToday && "bg-foreground text-background"
                )}
              >
                {d.getDate()}
              </span>
              <span className="mt-0.5 min-h-0 space-y-0.5 overflow-hidden">
                {[
                  ...(day?.events ?? []).map((e) => ({
                    id: e.id,
                    title: e.title,
                    color: e.feed?.color || EVENT_DOT,
                    task: false,
                  })),
                  ...(day?.tasks ?? []).map((t) => ({
                    id: t.id,
                    title: t.title,
                    color: TASK_DOT,
                    task: true,
                  })),
                ]
                  .slice(0, 2)
                  .map((it) => (
                    <span
                      key={it.id}
                      className="flex items-center gap-1 truncate text-[11px] leading-tight"
                    >
                      <span
                        className={cn(
                          "h-1.5 w-1.5 shrink-0",
                          it.task ? "rounded-[2px]" : "rounded-full"
                        )}
                        style={{ backgroundColor: it.color }}
                      />
                      <span className="truncate">{it.title}</span>
                    </span>
                  ))}
                {day && inMonth && day.events.length + day.tasks.length > 2 && (
                  <span className="block text-[10px] text-muted-foreground">
                    +{day.events.length + day.tasks.length - 2}
                  </span>
                )}
              </span>
            </button>
          );
        return (
          <button
            key={dayKey(d)}
            type="button"
            onClick={() => setSelected(d)}
            aria-label={d.toLocaleDateString(undefined, {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
            aria-pressed={isSel}
            className="group flex flex-col items-center py-0.5"
          >
            <span
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full text-[13px] tabular-nums transition-colors",
                !inMonth && "text-muted-foreground/40",
                isToday
                  ? "bg-foreground font-semibold text-background"
                  : isSel
                    ? "bg-tint-soft font-semibold"
                    : "group-hover:bg-secondary"
              )}
            >
              {d.getDate()}
            </span>
            <span className="mt-0.5 flex h-1.5 gap-0.5">
              {ds.map((c, i) => (
                <span
                  key={i}
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    !inMonth && "opacity-40"
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </span>
          </button>
        );
      })}
    </div>
  );

  const sel = byDay.get(dayKey(selected));
  const agenda = (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <p className="text-[13px] font-semibold capitalize tracking-title">
        {sameDay(selected, today)
          ? "Aujourd'hui"
          : selected.toLocaleDateString(undefined, {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
      </p>
      {!sel || sel.events.length + sel.tasks.length === 0 ? (
        <p className="mt-2 text-[13px] text-muted-foreground">Rien de prévu.</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {sel.events.map((e) => (
            <li key={e.id} className="flex items-baseline gap-2 text-[13px]">
              <span
                className="h-2 w-2 shrink-0 translate-y-[-1px] rounded-full"
                style={{ backgroundColor: e.feed?.color || EVENT_DOT }}
              />
              <span className="w-14 shrink-0 whitespace-nowrap tabular-nums text-muted-foreground">
                {e.allDay ? "Journée" : timeLabel(e.start)}
              </span>
              <span className="truncate">{e.title}</span>
            </li>
          ))}
          {sel.tasks.map((t) => (
            <li key={t.id} className="flex items-baseline gap-2 text-[13px]">
              <span
                className="h-2 w-2 shrink-0 translate-y-[-1px] rounded-[3px]"
                style={{ backgroundColor: TASK_DOT }}
              />
              <span className="w-14 shrink-0 text-muted-foreground">Tâche</span>
              <Link href="/tasks" className="truncate hover:underline">
                {t.title}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  if (preset === "split")
    return (
      <div className="flex h-full min-h-0 flex-col">
        {header}
        <div className="mt-3 flex min-h-0 flex-1 flex-col gap-3 sm:flex-row sm:gap-5">
          <div className="shrink-0 sm:w-[15.5rem]">{grid}</div>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col border-t border-border pt-3 sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0">
            {agenda}
          </div>
        </div>
      </div>
    );

  if (large)
    return (
      <div className="flex h-full min-h-0 flex-col">
        {header}
        <div className="mt-3 flex min-h-0 flex-1 flex-col">{grid}</div>
      </div>
    );

  // compact: the grid, then the selected day underneath.
  return (
    <div className="flex h-full min-h-0 flex-col">
      {header}
      <div className="mt-3 shrink-0">{grid}</div>
      <div className="mt-3 flex min-h-0 flex-1 flex-col border-t border-border pt-3">
        {agenda}
      </div>
    </div>
  );
}

function NavButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
    >
      {children}
    </button>
  );
}
