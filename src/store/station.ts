import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * "Stations" separate the user's contexts (e.g. personal vs work) and are used
 * to filter calendars and email by which connected account they belong to.
 *
 * - "personal" / "work" map to a ConnectedAccount.station tag.
 * - "both" disables filtering (show everything).
 *
 * The active station is persisted client-side; the account -> station mapping
 * itself lives in the database (ConnectedAccount.station).
 */
export type Station = "personal" | "work" | "both";

export const STATIONS: { value: Station; label: string }[] = [
  { value: "personal", label: "Personal" },
  { value: "work", label: "Work" },
  { value: "both", label: "Both" },
];

interface StationState {
  currentStation: Station;
  setStation: (station: Station) => void;
}

export const useStationStore = create<StationState>()(
  persist(
    (set) => ({
      currentStation: "both",
      setStation: (currentStation) => set({ currentStation }),
    }),
    { name: "fluid-station" }
  )
);

/**
 * Whether an account tagged `accountStation` should be visible under the
 * `current` station. Untagged accounts (null) are always visible.
 */
export function accountVisibleInStation(
  accountStation: string | null | undefined,
  current: Station
): boolean {
  if (current === "both") return true;
  if (!accountStation) return true;
  return accountStation === current;
}
