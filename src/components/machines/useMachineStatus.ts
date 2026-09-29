"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { MachineStats } from "@/lib/machines/netdata";

export interface MachineStatusRow {
  id: string;
  name: string;
  label: string | null;
  ttydUrl: string | null;
  statsUrl: string | null;
  kind?: string | null;
  projects: number;
  stats: MachineStats | null;
}

/**
 * Live readings of every machine, from /api/machines/status. Polls while the
 * tab is visible; `machines` stays null until the first answer.
 */
export function useMachineStatus(intervalMs = 5000) {
  const [machines, setMachines] = useState<MachineStatusRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const alive = useRef(true);

  const reload = useCallback(async () => {
    try {
      const res = await fetch("/api/machines/status", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { machines: MachineStatusRow[] };
      if (!alive.current) return;
      setMachines(data.machines);
      setFailed(false);
    } catch {
      if (alive.current) setFailed(true);
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      if (document.visibilityState === "visible") await reload();
      if (alive.current) timer = setTimeout(tick, intervalMs);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") reload();
    };
    tick();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive.current = false;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [reload, intervalMs]);

  return { machines, failed, reload };
}
