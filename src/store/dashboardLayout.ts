import { toast } from "sonner";
import { create } from "zustand";
import { persist } from "zustand/middleware";

import { tNow } from "@/i18n/now";
import {
  DEFAULT_LAYOUT,
  type WidgetSlot,
  sanitizeLayout,
} from "@/lib/dashboard/layout";

type State = {
  /** Null = the default layout (follows future changes to the default). */
  layout: WidgetSlot[] | null;
  synced: boolean;
  setLayout: (layout: WidgetSlot[] | null) => void;
  load: () => Promise<void>;
};

let saveTimer: ReturnType<typeof setTimeout> | undefined;

function save(layout: WidgetSlot[] | null) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      const r = await fetch("/api/dashboard-layout", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ layout }),
      });
      if (!r.ok) throw new Error(`Erreur ${r.status}`);
    } catch {
      toast.error(tNow("toasts.dashboard.layoutSaveFailed"), {
        description: tNow("toasts.dashboard.layoutSaveFailed.description"),
      });
    }
  }, 600);
}

/**
 * The dashboard bento: saved on the account so the phone and the desktop
 * share it, and cached in localStorage so the page never flashes the default.
 */
export const useDashboardLayout = create<State>()(
  persist(
    (set) => ({
      layout: null,
      synced: false,
      setLayout: (layout) => {
        set({ layout });
        save(layout);
      },
      load: async () => {
        try {
          const r = await fetch("/api/dashboard-layout", { cache: "no-store" });
          if (!r.ok) return;
          const { layout } = await r.json();
          set({ layout: layout ? sanitizeLayout(layout) : null, synced: true });
        } catch {}
      },
    }),
    {
      name: "dashboard-layout",
      partialize: (s) => ({ layout: s.layout }),
      merge: (persisted, current) => ({
        ...current,
        layout: sanitizeLayout((persisted as Partial<State>)?.layout) ?? null,
      }),
    }
  )
);

export const resolvedLayout = (layout: WidgetSlot[] | null) =>
  layout ?? DEFAULT_LAYOUT;
