import { toast } from "sonner";
import { create } from "zustand";

import type { RoutineBlockLite, RoutineLayerLite } from "@/lib/routine";

export type BlockDraft = Omit<RoutineBlockLite, "id" | "layerId"> & {
  layerId?: string;
};

interface RoutineState {
  layers: RoutineLayerLite[];
  loaded: boolean;
  /** « Dessiner » mode: blocks become editable events in the week/day view. */
  editing: boolean;
  /** The block whose dialog is open; `null` + draft = creating. */
  dialog: {
    block: RoutineBlockLite | null;
    draft?: Partial<BlockDraft>;
  } | null;

  load: () => Promise<void>;
  setEditing: (editing: boolean) => void;
  openBlock: (block: RoutineBlockLite) => void;
  openNewBlock: (draft?: Partial<BlockDraft>) => void;
  closeDialog: () => void;

  toggleLayer: (id: string) => Promise<void>;
  createLayer: (name: string) => Promise<void>;
  renameLayer: (id: string, name: string) => Promise<void>;
  deleteLayer: (id: string) => Promise<void>;

  createBlock: (draft: BlockDraft) => Promise<boolean>;
  updateBlock: (id: string, patch: Partial<BlockDraft>) => Promise<boolean>;
  deleteBlock: (id: string) => Promise<void>;
}

async function send<T>(
  url: string,
  method: string,
  body?: unknown
): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Erreur du serveur");
  }
  return res.json();
}

/** Calendar layers (« Semaine type ») and their routine blocks. */
export const useRoutineStore = create<RoutineState>()((set, get) => ({
  layers: [],
  loaded: false,
  editing: false,
  dialog: null,

  load: async () => {
    try {
      const layers = await send<RoutineLayerLite[]>("/api/routine", "GET");
      set({ layers, loaded: true });
    } catch {
      set({ loaded: true });
    }
  },

  setEditing: (editing) => set({ editing }),
  openBlock: (block) => set({ dialog: { block } }),
  openNewBlock: (draft) => set({ dialog: { block: null, draft } }),
  closeDialog: () => set({ dialog: null }),

  toggleLayer: async (id) => {
    const layer = get().layers.find((l) => l.id === id);
    if (!layer) return;
    const visible = !layer.visible;
    set({
      layers: get().layers.map((l) => (l.id === id ? { ...l, visible } : l)),
    });
    try {
      await send(`/api/routine/layers/${id}`, "PATCH", { visible });
    } catch (e) {
      set({
        layers: get().layers.map((l) =>
          l.id === id ? { ...l, visible: !visible } : l
        ),
      });
      toast.error((e as Error).message);
    }
  },

  createLayer: async (name) => {
    try {
      const layer = await send<RoutineLayerLite>(
        "/api/routine/layers",
        "POST",
        { name }
      );
      set({ layers: [...get().layers, layer] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  },

  renameLayer: async (id, name) => {
    try {
      const layer = await send<RoutineLayerLite>(
        `/api/routine/layers/${id}`,
        "PATCH",
        { name }
      );
      set({ layers: get().layers.map((l) => (l.id === id ? layer : l)) });
    } catch (e) {
      toast.error((e as Error).message);
    }
  },

  deleteLayer: async (id) => {
    const before = get().layers;
    set({ layers: before.filter((l) => l.id !== id) });
    try {
      await send(`/api/routine/layers/${id}`, "DELETE");
    } catch (e) {
      set({ layers: before });
      toast.error((e as Error).message);
    }
  },

  createBlock: async (draft) => {
    try {
      await send<RoutineBlockLite>("/api/routine/blocks", "POST", draft);
      // Reload: the first block also creates the « Semaine type » layer.
      await get().load();
      return true;
    } catch (e) {
      toast.error((e as Error).message);
      return false;
    }
  },

  updateBlock: async (id, patch) => {
    const before = get().layers;
    // Optimistic, so a dragged block doesn't jump back while saving.
    set({
      layers: before.map((l) => ({
        ...l,
        blocks: l.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)),
      })),
    });
    try {
      await send<RoutineBlockLite>(`/api/routine/blocks/${id}`, "PATCH", patch);
      if (patch.layerId) await get().load();
      return true;
    } catch (e) {
      set({ layers: before });
      toast.error((e as Error).message);
      return false;
    }
  },

  deleteBlock: async (id) => {
    const before = get().layers;
    set({
      layers: before.map((l) => ({
        ...l,
        blocks: l.blocks.filter((b) => b.id !== id),
      })),
    });
    try {
      await send(`/api/routine/blocks/${id}`, "DELETE");
    } catch (e) {
      set({ layers: before });
      toast.error((e as Error).message);
    }
  },
}));

/** Blocks of the visible layers. */
export function visibleBlocks(layers: RoutineLayerLite[]): RoutineBlockLite[] {
  return layers.filter((l) => l.visible).flatMap((l) => l.blocks);
}
