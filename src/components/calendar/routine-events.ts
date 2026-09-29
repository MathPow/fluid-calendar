import type { EventApi, EventInput } from "@fullcalendar/core";

import {
  type RoutineBlockLite,
  expandRoutine,
  routineColor,
  subtractBusy,
} from "@/lib/routine";

import { type BlockDraft, useRoutineStore } from "@/store/routine";

type Busy = { start: Date; end: Date; allDay?: boolean };

/**
 * The routine blocks as FullCalendar events for [start, end).
 *
 * Normally they are background events cut around the busy intervals (real
 * events and scheduled tasks override the routine). In « Dessiner » mode they
 * are regular, draggable events carrying their block.
 */
export function routineCalendarEvents(
  blocks: RoutineBlockLite[],
  start: Date,
  end: Date,
  busy: Busy[],
  editing: boolean
): EventInput[] {
  const occurrences = expandRoutine(blocks, start, end);

  if (editing) {
    return occurrences.map((o) => ({
      id: `routine:${o.block.id}:${o.start.toISOString()}`,
      title: o.block.title,
      start: o.start,
      end: o.end,
      backgroundColor: routineColor(o.block),
      borderColor: routineColor(o.block),
      textColor: "#19181c",
      classNames: ["calendar-routine-edit"],
      extendedProps: { isRoutine: true, block: o.block, day: o.day },
    }));
  }

  const timed = busy.filter((b) => !b.allDay);
  return occurrences.flatMap((o) =>
    subtractBusy(o.start, o.end, timed).map((piece, i) => ({
      id: `routine:${o.block.id}:${o.start.toISOString()}:${i}`,
      title: o.block.title,
      start: piece.start,
      end: piece.end,
      display: "background",
      backgroundColor: routineColor(o.block),
      classNames: ["calendar-routine"],
    }))
  );
}

const hhmm = (d: Date) =>
  `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

/**
 * The block change for an occurrence dragged or stretched from `fromDay` to
 * [start, end): new hours apply to every day of the block, and moving to
 * another day swaps that one weekday. Null if the result isn't a valid block.
 */
export function blockPatchFromMove(
  block: RoutineBlockLite,
  fromDay: number,
  start: Date,
  end: Date
): Partial<BlockDraft> | null {
  const minutes = (end.getTime() - start.getTime()) / 60_000;
  if (minutes <= 0 || minutes >= 24 * 60) return null;
  const toDay = start.getDay();
  const days =
    toDay === fromDay
      ? block.days
      : [...new Set(block.days.map((d) => (d === fromDay ? toDay : d)))].sort();
  return { days, startTime: hhmm(start), endTime: hhmm(end) };
}

/** The draft for a new block from a range selected in « Dessiner » mode. */
export function draftFromSelection(
  start: Date,
  end: Date
): Partial<BlockDraft> {
  return { days: [start.getDay()], startTime: hhmm(start), endTime: hhmm(end) };
}

/** Save a dragged or stretched routine occurrence, or put it back. */
export async function moveRoutineBlock(event: EventApi, revert: () => void) {
  const { block, day } = event.extendedProps as {
    block: RoutineBlockLite;
    day: number;
  };
  const patch =
    event.start && event.end
      ? blockPatchFromMove(block, day, event.start, event.end)
      : null;
  if (!patch) return revert();
  const ok = await useRoutineStore.getState().updateBlock(block.id, patch);
  if (!ok) revert();
}
