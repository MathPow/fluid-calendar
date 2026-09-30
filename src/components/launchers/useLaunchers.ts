"use client";

import { useEffect } from "react";

import { toast } from "sonner";
import { create } from "zustand";

import type { LauncherRow } from "@/lib/launchers";

type State = {
  items: LauncherRow[];
  loaded: boolean;
  manageOpen: boolean;
  set: (s: Partial<State>) => void;
};

export const useLauncherStore = create<State>()((set) => ({
  items: [],
  loaded: false,
  manageOpen: false,
  set: (s) => set(s),
}));

export async function reloadLaunchers() {
  try {
    const r = await fetch("/api/launchers", { cache: "no-store" });
    if (r.ok)
      useLauncherStore.getState().set({ items: await r.json(), loaded: true });
  } catch {}
}

const FINAL: Record<string, string> = {
  done: "Fait",
  failed: "Échec",
  denied: "Refusé sur l'ordi",
};

/**
 * Send a launcher's command and follow it in a toast until the agent is done
 * (a shell command waits for its « Exécuter » on the desktop, up to ~2 min).
 */
export async function runLauncher(l: LauncherRow) {
  const id = toast.loading(
    `${l.label} → ${l.machine.label || l.machine.name}…`
  );
  try {
    const r = await fetch(`/api/launchers/${l.id}/run`, { method: "POST" });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.error || `Erreur ${r.status}`);
    const deadline = Date.now() + (l.action === "shell" ? 280_000 : 60_000);
    while (Date.now() < deadline) {
      await new Promise((res) => setTimeout(res, 1200));
      const s = await fetch(`/api/desktop-commands/${body.commandId}`, {
        cache: "no-store",
      })
        .then((x) => (x.ok ? x.json() : null))
        .catch(() => null);
      if (!s) continue;
      if (s.status === "running" && l.action === "shell") {
        toast.loading(`${l.label} : confirme sur ${body.machine}…`, { id });
      }
      if (FINAL[s.status]) {
        const detail =
          s.error ||
          (s.output
            ? String(s.output).trim().split("\n").slice(-3).join("\n")
            : undefined);
        if (s.status === "done")
          toast.success(`${l.label} · ${FINAL.done}`, {
            id,
            description: detail,
          });
        else
          toast.error(`${l.label} · ${FINAL[s.status]}`, {
            id,
            description: detail,
          });
        return;
      }
    }
    toast.message(`${l.label} : toujours en attente`, {
      id,
      description: "Vois l'historique dans Machines ▸ Commandes.",
    });
  } catch (e) {
    toast.error(`${l.label} : impossible`, {
      id,
      description: e instanceof Error ? e.message : undefined,
    });
  }
}

export function useLaunchers() {
  const state = useLauncherStore();
  useEffect(() => {
    if (!useLauncherStore.getState().loaded) reloadLaunchers();
  }, []);
  return state;
}
