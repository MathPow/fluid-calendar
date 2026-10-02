"use client";

import { useEffect } from "react";

import { toast } from "sonner";
import { create } from "zustand";

import { tNow } from "@/i18n/now";
import { isPromptKind, type LauncherRow } from "@/lib/launchers";

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
  done: "toasts.launchers.status.done",
  failed: "toasts.launchers.status.failed",
  denied: "toasts.launchers.status.denied",
};

/**
 * Fire a launcher. Shell kinds ride the desktop agent + a status-polling
 * toast; prompt kinds fire-and-forget (a single toast, the row updates on
 * next reload with `lastResult`).
 */
export async function runLauncher(l: LauncherRow) {
  const machineName = l.machine?.label || l.machine?.name || "…";
  if (isPromptKind(l.kind)) {
    const id = toast.loading(
      tNow("toasts.launchers.running", { label: l.label, machine: machineName })
    );
    try {
      const r = await fetch(`/api/launchers/${l.id}/run`, { method: "POST" });
      const body = await r.json().catch(() => ({}));
      if (!r.ok)
        throw new Error(body.error || tNow("common.error", { status: r.status }));
      toast.success(
        tNow("toasts.launchers.launched", { label: l.label, machine: machineName }),
        {
          id,
          description: tNow("toasts.launchers.launched.description"),
        }
      );
      setTimeout(reloadLaunchers, 5_000);
    } catch (e) {
      toast.error(tNow("toasts.launchers.failed", { label: l.label }), {
        id,
        description: e instanceof Error ? e.message : undefined,
      });
    }
    return;
  }

  const id = toast.loading(
    tNow("toasts.launchers.running", { label: l.label, machine: machineName })
  );
  try {
    const r = await fetch(`/api/launchers/${l.id}/run`, { method: "POST" });
    const body = await r.json().catch(() => ({}));
    if (!r.ok)
        throw new Error(body.error || tNow("common.error", { status: r.status }));
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
        toast.loading(
          tNow("toasts.launchers.confirmOn", { label: l.label, machine: body.machine }),
          { id }
        );
      }
      if (FINAL[s.status]) {
        const detail =
          s.error ||
          (s.output
            ? String(s.output).trim().split("\n").slice(-3).join("\n")
            : undefined);
        if (s.status === "done")
          toast.success(`${l.label} · ${tNow(FINAL.done)}`, {
            id,
            description: detail,
          });
        else
          toast.error(`${l.label} · ${tNow(FINAL[s.status])}`, {
            id,
            description: detail,
          });
        return;
      }
    }
    toast.message(tNow("toasts.launchers.stillWaiting", { label: l.label }), {
      id,
      description: tNow("toasts.launchers.stillWaiting.description"),
    });
  } catch (e) {
    toast.error(tNow("toasts.launchers.failed", { label: l.label }), {
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
