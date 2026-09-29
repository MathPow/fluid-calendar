"use client";

import { useCallback, useEffect } from "react";

import { create } from "zustand";

export type NotificationItem = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  url: string | null;
  source: string | null;
  important: boolean;
  readAt: string | null;
  createdAt: string;
};

type State = {
  items: NotificationItem[];
  unread: number;
  loaded: boolean;
  set: (s: Partial<State>) => void;
};

// One store so the bell and the dashboard tile stay in sync.
const useStore = create<State>()((set) => ({
  items: [],
  unread: 0,
  loaded: false,
  set: (s) => set(s),
}));

let inflight: Promise<void> | null = null;

async function refresh() {
  if (inflight) return inflight;
  inflight = fetch("/api/notifications?limit=40", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => {
      if (data)
        useStore
          .getState()
          .set({ items: data.items, unread: data.unread, loaded: true });
    })
    .catch(() => {})
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/**
 * The notification feed, refreshed every minute while the tab is visible and
 * when the window regains focus.
 */
export function useNotifications() {
  const { items, unread, loaded } = useStore();

  useEffect(() => {
    refresh();
    const tick = () => document.visibilityState === "visible" && refresh();
    const id = window.setInterval(tick, 60_000);
    window.addEventListener("focus", tick);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", tick);
    };
  }, []);

  const markRead = useCallback(async (ids: string[] | "all") => {
    const s = useStore.getState();
    const now = new Date().toISOString();
    const hit = (n: NotificationItem) =>
      !n.readAt && (ids === "all" || ids.includes(n.id));
    const count = s.items.filter(hit).length;
    s.set({
      items: s.items.map((n) => (hit(n) ? { ...n, readAt: now } : n)),
      unread: ids === "all" ? 0 : Math.max(0, s.unread - count),
    });
    await fetch("/api/notifications/read", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(ids === "all" ? { all: true } : { ids }),
    }).catch(() => {});
  }, []);

  return { items, unread, loaded, markRead, refresh };
}
