import { create } from "zustand";

import type { RoutineBlockLite } from "@/lib/routine";

/**
 * A calendar block copied to be pasted on another day or slot: a real event
 * (pasted as a one-off copy, even from a recurring series) or a « Semaine
 * type » block (pasted as a new block on the target weekday).
 */
export type CalendarClip =
  | {
      kind: "event";
      title: string;
      description?: string;
      location?: string;
      feedId: string;
      allDay: boolean;
      /** Length of the block, in ms. */
      duration: number;
      /** Source start, so a timed block pasted on a day keeps its hour. */
      start: Date;
      strongAlarm?: boolean;
      alarmMinutes?: number;
      organisationId?: string | null;
    }
  | {
      kind: "routine";
      block: RoutineBlockLite;
      /** Length of one occurrence, in minutes. */
      duration: number;
    };

interface ClipboardState {
  clip: CalendarClip | null;
  setClip: (clip: CalendarClip | null) => void;
}

export const useCalendarClipboard = create<ClipboardState>()((set) => ({
  clip: null,
  setClip: (clip) => set({ clip }),
}));
