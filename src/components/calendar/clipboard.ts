import { type RefObject, useCallback, useEffect, useRef } from "react";

import { translate } from "@/i18n/catalogs";
import type { DateSelectArg, EventApi } from "@fullcalendar/core";
import { toast } from "sonner";

import { newDate } from "@/lib/date-utils";
import type { RoutineBlockLite } from "@/lib/routine";

import { useCalendarStore } from "@/store/calendar";
import { useCalendarClipboard } from "@/store/calendarClipboard";
import { useRoutineStore } from "@/store/routine";
import { useSettingsStore } from "@/store/settings";

import type { CalendarEvent } from "@/types/calendar";

const tr = (k: string, params?: Record<string, string | number>) =>
  translate(
    (useSettingsStore.getState().user.locale as "fr" | "en") || "fr",
    k,
    params
  );

const MINUTE = 60_000;
const DAY_MINUTES = 24 * 60;

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
};
const fromMinutes = (total: number) => {
  const m = ((total % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

/** Put a real event on the clipboard (a recurring one pastes as a one-off). */
export function copyEvent(event: CalendarEvent) {
  const start = newDate(event.start);
  const end = newDate(event.end);
  useCalendarClipboard.getState().setClip({
    kind: "event",
    title: event.title,
    description: event.description,
    location: event.location,
    feedId: event.feedId,
    allDay: event.allDay,
    duration: Math.max(end.getTime() - start.getTime(), 0),
    start,
    strongAlarm: event.strongAlarm,
    alarmMinutes: event.alarmMinutes,
    organisationId: event.organisationLinked ? event.organisationId : null,
  });
  toast.success(tr("calendar.clipboard.copied", { title: event.title }));
}

/** Put a « Semaine type » block on the clipboard. */
export function copyRoutineBlock(block: RoutineBlockLite) {
  let duration = toMinutes(block.endTime) - toMinutes(block.startTime);
  if (duration <= 0) duration += DAY_MINUTES; // crosses midnight
  useCalendarClipboard.getState().setClip({ kind: "routine", block, duration });
  toast.success(tr("calendar.clipboard.copied", { title: block.title }));
}

/** Copy whatever FullCalendar block this is; false for tasks & backdrops. */
export function copyEventApi(event: EventApi): boolean {
  const props = event.extendedProps;
  if (props.isRoutine && props.block) {
    copyRoutineBlock(props.block as RoutineBlockLite);
    return true;
  }
  if (props.isTask || event.display === "background") return false;
  const source = useCalendarStore
    .getState()
    .events.find((e) => e.id === event.id);
  if (!source) return false;
  copyEvent(source);
  return true;
}

/**
 * Paste the clipboard at `at`. `allDay` is true for a day cell (month view or
 * the all-day row): a timed block then keeps its original hour on that day.
 */
export async function pasteClip(at: Date, allDay: boolean) {
  const clip = useCalendarClipboard.getState().clip;
  if (!clip) return;

  if (clip.kind === "routine") {
    const startMin = allDay
      ? toMinutes(clip.block.startTime)
      : at.getHours() * 60 + at.getMinutes();
    const { title, kind, color, schedulable, layerId } = clip.block;
    const ok = await useRoutineStore.getState().createBlock({
      title,
      kind,
      color,
      schedulable,
      layerId,
      days: [at.getDay()],
      startTime: fromMinutes(startMin),
      endTime: fromMinutes(startMin + clip.duration),
    });
    if (ok) toast.success(tr("calendar.clipboard.pasted", { title }));
    return;
  }

  const day = new Date(at.getFullYear(), at.getMonth(), at.getDate());
  let start: Date;
  if (clip.allDay) start = day;
  else if (allDay)
    start = new Date(
      day.getFullYear(),
      day.getMonth(),
      day.getDate(),
      clip.start.getHours(),
      clip.start.getMinutes()
    );
  else start = at;
  const end = new Date(start.getTime() + clip.duration);

  const store = useCalendarStore.getState();
  const feedId = store.feeds.some((f) => f.id === clip.feedId)
    ? clip.feedId
    : useSettingsStore.getState().calendar.defaultCalendarId;
  if (!feedId) {
    toast.error(tr("calendar.clipboard.noCalendar"));
    return;
  }

  try {
    const id = await store.addEvent({
      title: clip.title,
      description: clip.description,
      location: clip.location,
      start,
      end,
      feedId,
      allDay: clip.allDay,
      strongAlarm: clip.strongAlarm,
      alarmMinutes: clip.alarmMinutes,
      isRecurring: false,
      isMaster: false,
    });
    const created =
      id ??
      useCalendarStore
        .getState()
        .events.find(
          (e) =>
            e.feedId === feedId &&
            e.title === clip.title &&
            newDate(e.start).getTime() === start.getTime()
        )?.id;
    if (created && clip.organisationId) {
      await fetch(`/api/events/${created}/organisation`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organisationId: clip.organisationId }),
      });
      await useCalendarStore.getState().loadFromDatabase();
    }
    toast.success(tr("calendar.clipboard.pasted", { title: clip.title }), {
      action: created
        ? {
            label: tr("calendar.clipboard.undo"),
            onClick: () =>
              useCalendarStore.getState().removeEvent(created, "single"),
          }
        : undefined,
    });
  } catch (error) {
    toast.error(
      error instanceof Error ? error.message : tr("calendar.clipboard.failed")
    );
  }
}

const isTypingTarget = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    !!target.closest("input, textarea, select, [contenteditable='true']"));

const parseDay = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
};

/** The calendar slot under a screen point, read from FullCalendar's DOM. */
function slotAt(x: number, y: number): { date: Date; allDay: boolean } | null {
  const stack = document.elementsFromPoint(x, y);
  const col = stack.find((el) => el.matches("td.fc-timegrid-col[data-date]"));
  const lane = stack.find((el) =>
    el.matches("td.fc-timegrid-slot-lane[data-time]")
  );
  if (col && lane) {
    const date = parseDay(col.getAttribute("data-date")!);
    const [h, m] = lane.getAttribute("data-time")!.split(":").map(Number);
    date.setHours(h, m);
    return { date, allDay: false };
  }
  const cell = stack.find((el) => el.matches("td.fc-daygrid-day[data-date]"));
  if (cell)
    return { date: parseDay(cell.getAttribute("data-date")!), allDay: true };
  return null;
}

/**
 * Copy / paste for one FullCalendar view:
 * - Ctrl/Cmd+C copies the block under the mouse (or the one shown in the
 *   quick view, via `copyEvent`); Ctrl/Cmd+V pastes it in the slot under it.
 * - While something is copied, a single click on a slot pastes there (drag a
 *   range to create a new event as usual) — that's the way on a phone.
 * - Esc forgets the copied block.
 */
export function useCalendarClipboardKeys(
  containerRef: RefObject<HTMLElement | null>
) {
  const hovered = useRef<EventApi | null>(null);
  const pointer = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const move = (e: MouseEvent) => {
      pointer.current = { x: e.clientX, y: e.clientY };
    };
    const leave = () => {
      pointer.current = null;
    };
    el.addEventListener("mousemove", move);
    el.addEventListener("mouseleave", leave);
    return () => {
      el.removeEventListener("mousemove", move);
      el.removeEventListener("mouseleave", leave);
    };
  }, [containerRef]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      // A dialog on top owns the keyboard.
      if (document.querySelector("[role='dialog']")) return;
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      if (mod && key === "c") {
        // Leave normal text copying alone.
        if (window.getSelection()?.toString()) return;
        if (hovered.current && copyEventApi(hovered.current))
          e.preventDefault();
      } else if (mod && key === "v") {
        if (!useCalendarClipboard.getState().clip || !pointer.current) return;
        const slot = slotAt(pointer.current.x, pointer.current.y);
        if (!slot) return;
        e.preventDefault();
        void pasteClip(slot.date, slot.allDay);
      } else if (e.key === "Escape" && useCalendarClipboard.getState().clip) {
        useCalendarClipboard.getState().setClip(null);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const onEventMouseEnter = useCallback((arg: { event: EventApi }) => {
    hovered.current = arg.event;
  }, []);
  const onEventMouseLeave = useCallback(() => {
    hovered.current = null;
  }, []);

  /**
   * In paste mode a single-slot click (one time slot, or one day) pastes
   * instead of opening the new-event form. True when it was handled.
   */
  const pasteOnSelect = useCallback(
    (sel: DateSelectArg, slotMinutes = 30): boolean => {
      if (!useCalendarClipboard.getState().clip) return false;
      const minutes = (sel.end.getTime() - sel.start.getTime()) / MINUTE;
      const single = sel.allDay
        ? minutes <= DAY_MINUTES
        : minutes <= slotMinutes;
      if (!single) return false;
      sel.view.calendar.unselect();
      void pasteClip(sel.start, sel.allDay);
      return true;
    },
    []
  );

  return { onEventMouseEnter, onEventMouseLeave, pasteOnSelect };
}
