import { fromZonedTime, toZonedTime } from "date-fns-tz";

/**
 * Weekly routine blocks ("Semaine type"): expanding them into dated
 * occurrences, and cutting them around real events. Shared by the calendar
 * views (browser local time) and the auto-scheduler (user time zone).
 */

export type RoutineKind = "work" | "sleep" | "sport" | "detente" | "perso" | "other";

export const ROUTINE_KINDS: {
  value: RoutineKind;
  label: string;
  color: string;
  schedulable: boolean;
}[] = [
  { value: "work", label: "Travail", color: "#a8ccff", schedulable: true },
  { value: "sleep", label: "Sommeil", color: "#c9b8f0", schedulable: false },
  { value: "sport", label: "Sport", color: "#9fe0bd", schedulable: false },
  { value: "detente", label: "Détente", color: "#ffc2b8", schedulable: false },
  { value: "perso", label: "Perso", color: "#ffd88a", schedulable: false },
  { value: "other", label: "Autre", color: "#d9d4cc", schedulable: false },
];

export const WEEKDAYS_FR = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];

export type RoutineBlockLite = {
  id: string;
  layerId: string;
  title: string;
  kind: string;
  color: string | null;
  days: number[];
  startTime: string;
  endTime: string;
  schedulable: boolean;
};

export type RoutineLayerLite = {
  id: string;
  name: string;
  visible: boolean;
  blocks: RoutineBlockLite[];
};

export type RoutineOccurrence = {
  block: RoutineBlockLite;
  /** Weekday the occurrence starts on (0 = Sunday). */
  day: number;
  start: Date;
  end: Date;
};

export function routineColor(
  block: Pick<RoutineBlockLite, "kind" | "color">
): string {
  return (
    block.color ||
    ROUTINE_KINDS.find((k) => k.value === block.kind)?.color ||
    "#d9d4cc"
  );
}

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
};

/** True when the block ends on the next day (end at or before start). */
export function crossesMidnight(
  block: Pick<RoutineBlockLite, "startTime" | "endTime">
): boolean {
  return toMinutes(block.endTime) <= toMinutes(block.startTime);
}

/** "Lun–Ven", "Lun, Mer, Ven", "Tous les jours"… */
export function formatDays(days: number[], weekStartsMonday = true): string {
  if (days.length === 7) return "Tous les jours";
  const order = weekStartsMonday
    ? [1, 2, 3, 4, 5, 6, 0]
    : [0, 1, 2, 3, 4, 5, 6];
  const sorted = order.filter((d) => days.includes(d));
  const idx = sorted.map((d) => order.indexOf(d));
  const contiguous = idx.every((v, i) => i === 0 || v === idx[i - 1] + 1);
  if (sorted.length >= 3 && contiguous) {
    return `${WEEKDAYS_FR[sorted[0]]}–${WEEKDAYS_FR[sorted[sorted.length - 1]]}`;
  }
  return sorted.map((d) => WEEKDAYS_FR[d]).join(", ");
}

/**
 * The dated occurrences of `blocks` overlapping [rangeStart, rangeEnd).
 * Without `timeZone` wall times are read in the runtime's local zone (the
 * calendar views run with FullCalendar's timeZone="local"); with it, in that
 * IANA zone (the scheduler, on the server).
 */
export function expandRoutine(
  blocks: RoutineBlockLite[],
  rangeStart: Date,
  rangeEnd: Date,
  timeZone?: string
): RoutineOccurrence[] {
  const out: RoutineOccurrence[] = [];
  // Start a day early so a block crossing midnight into the range is kept.
  const first = timeZone
    ? toZonedTime(rangeStart, timeZone)
    : new Date(rangeStart);
  const cursor = new Date(
    first.getFullYear(),
    first.getMonth(),
    first.getDate() - 1
  );
  const lastLocal = timeZone ? toZonedTime(rangeEnd, timeZone) : rangeEnd;

  const at = (y: number, mo: number, d: number, hhmm: string) => {
    const mins = toMinutes(hhmm);
    if (!timeZone) return new Date(y, mo, d, Math.floor(mins / 60), mins % 60);
    const pad = (n: number) => String(n).padStart(2, "0");
    // Normalise day overflow (d + 1 at month end) through a local Date first.
    const n = new Date(y, mo, d);
    return fromZonedTime(
      `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}T${pad(Math.floor(mins / 60))}:${pad(mins % 60)}:00`,
      timeZone
    );
  };

  while (cursor <= lastLocal) {
    const y = cursor.getFullYear();
    const mo = cursor.getMonth();
    const d = cursor.getDate();
    const weekday = cursor.getDay();
    for (const block of blocks) {
      if (!block.days.includes(weekday)) continue;
      const start = at(y, mo, d, block.startTime);
      const end = at(y, mo, crossesMidnight(block) ? d + 1 : d, block.endTime);
      if (end > rangeStart && start < rangeEnd)
        out.push({ block, day: weekday, start, end });
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

/**
 * What's left of [start, end) once the busy intervals are cut out. Fragments
 * shorter than `minMinutes` are dropped so a block doesn't leave slivers.
 */
export function subtractBusy(
  start: Date,
  end: Date,
  busy: { start: Date; end: Date }[],
  minMinutes = 10
): { start: Date; end: Date }[] {
  let pieces = [{ start, end }];
  for (const b of busy) {
    if (b.end <= start || b.start >= end) continue;
    pieces = pieces.flatMap((p) => {
      if (b.end <= p.start || b.start >= p.end) return [p];
      const left = {
        start: p.start,
        end: b.start < p.start ? p.start : b.start,
      };
      const right = { start: b.end > p.end ? p.end : b.end, end: p.end };
      return [left, right].filter((x) => x.end > x.start);
    });
  }
  return pieces.filter(
    (p) => p.end.getTime() - p.start.getTime() >= minMinutes * 60_000
  );
}
