import { create } from "zustand";

export interface OrganisationBadge {
  id: string;
  name: string;
  color: string | null;
  image: string | null;
}

interface OrganisationsState {
  organisations: OrganisationBadge[];
  loaded: boolean;
  /** Fetch once (again with `force`); calendar blocks and the event form share it. */
  load: (force?: boolean) => Promise<void>;
  byId: (id: string | null | undefined) => OrganisationBadge | undefined;
}

let inflight: Promise<void> | null = null;

export const useOrganisationsStore = create<OrganisationsState>((set, get) => ({
  organisations: [],
  loaded: false,
  load: async (force) => {
    if (get().loaded && !force) return;
    inflight ??= fetch("/api/organisations")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: OrganisationBadge[]) =>
        set({
          organisations: rows.map(({ id, name, color, image }) => ({ id, name, color, image })),
          loaded: true,
        })
      )
      .catch(() => set({ loaded: true }))
      .finally(() => {
        inflight = null;
      });
    return inflight;
  },
  byId: (id) => (id ? get().organisations.find((o) => o.id === id) : undefined),
}));
