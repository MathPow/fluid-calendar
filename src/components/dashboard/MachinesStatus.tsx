"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Pencil, Plus, TerminalSquare } from "lucide-react";
import { toast } from "sonner";

import {
  MachineDialog,
  type MachineLite,
  type MachineValues,
} from "@/components/projets/MachineDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import type { MachineStats, Usage } from "@/lib/machines/netdata";
import { cn } from "@/lib/utils";

interface MachineRow extends MachineLite {
  projects: number;
  stats: MachineStats | null;
}

const REFRESH_MS = 5000;

const round = (v: number) =>
  v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(0) : v.toFixed(1);

const size = (u: Usage) =>
  u.total >= 100
    ? `${u.used.toFixed(0)} / ${u.total.toFixed(0)} GB`
    : `${u.used.toFixed(1)} / ${u.total.toFixed(1)} GB`;

const rate = (kbps: number) =>
  kbps >= 1000 ? `${(kbps / 1000).toFixed(1)} Mb/s` : `${kbps.toFixed(0)} kb/s`;

function uptime(seconds: number) {
  const d = Math.floor(seconds / 86400);
  if (d >= 1) return `up ${d} d`;
  const h = Math.floor(seconds / 3600);
  if (h >= 1) return `up ${h} h`;
  return `up ${Math.max(1, Math.floor(seconds / 60))} min`;
}

type Tone = "ok" | "warn" | "bad";
const tone = (v: number, warn: number, bad: number): Tone =>
  v >= bad ? "bad" : v >= warn ? "warn" : "ok";

const FILL: Record<Tone, string> = {
  ok: "bg-foreground/70",
  warn: "bg-pending-foreground",
  bad: "bg-negative-foreground",
};

function Meter({
  label,
  pct,
  detail,
  warn,
  bad,
}: {
  label: string;
  pct: number | null | undefined;
  detail?: string;
  warn: number;
  bad: number;
}) {
  const known = typeof pct === "number";
  const t = known ? tone(pct, warn, bad) : "ok";
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="etiquette">{label}</span>
        <span className="min-w-0 truncate text-[12px] text-muted-foreground">
          {detail && <span className="mr-2">{detail}</span>}
          <span
            className={cn(
              "text-[13px] font-semibold tabular-nums text-foreground",
              t === "warn" && "text-pending-foreground",
              t === "bad" && "text-negative-foreground"
            )}
          >
            {known ? `${round(pct)} %` : "—"}
          </span>
        </span>
      </div>
      <div
        className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-foreground/10"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={known ? Math.round(pct) : undefined}
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-500",
            FILL[t]
          )}
          style={{ width: `${known ? Math.max(2, Math.min(100, pct)) : 0}%` }}
        />
      </div>
    </div>
  );
}

function MachineCard({
  machine,
  onEdit,
}: {
  machine: MachineRow;
  onEdit: () => void;
}) {
  const s = machine.stats;
  const online = !!s?.online;
  const title = machine.label || machine.name;

  const facts = [
    s?.os,
    s?.cores ? `${s.cores} cores` : null,
    machine.projects > 0
      ? `${machine.projects} project${machine.projects > 1 ? "s" : ""}`
      : null,
  ].filter(Boolean);

  const foot = online
    ? [
        typeof s.temp === "number" ? `${s.temp.toFixed(0)} °C` : null,
        typeof s.load === "number" ? `load ${s.load.toFixed(2)}` : null,
        s.net ? `↓ ${rate(s.net.rx)} · ↑ ${rate(s.net.tx)}` : null,
        s.power ? `${s.power.watts.toFixed(0)} W` : null,
        typeof s.uptime === "number" ? uptime(s.uptime) : null,
      ].filter(Boolean)
    : [];

  return (
    <li className="flex flex-col rounded-[20px] bg-secondary p-5">
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "mt-[7px] h-2.5 w-2.5 shrink-0 rounded-full",
            online
              ? "bg-[#2f9e68]"
              : s
                ? "bg-negative-foreground"
                : "bg-foreground/25"
          )}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[17px] font-bold leading-tight tracking-title">
            {title}
          </p>
          <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
            {online
              ? facts.join(" · ") || "online"
              : s
                ? `offline${s.error ? ` · ${s.error}` : ""}`
                : "no stats address"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {machine.ttydUrl && (
            <a
              href={machine.ttydUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
              title={`Open the terminal · ${title}`}
              aria-label={`Open the terminal of ${title}`}
            >
              <TerminalSquare className="h-4 w-4" />
            </a>
          )}
          <button
            type="button"
            onClick={onEdit}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
            aria-label={`Edit ${title}`}
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {online ? (
        <>
          <div className="mt-4 space-y-3">
            <Meter label="CPU" pct={s.cpu} warn={70} bad={90} />
            <Meter
              label="RAM"
              pct={s.ram?.pct}
              detail={s.ram ? size(s.ram) : undefined}
              warn={75}
              bad={90}
            />
            <Meter
              label="Disk"
              pct={s.disk?.pct}
              detail={s.disk ? size(s.disk) : undefined}
              warn={80}
              bad={92}
            />
            {s.gpu && (
              <>
                <Meter
                  label="GPU"
                  pct={s.gpu.util}
                  detail={[
                    typeof s.gpu.temp === "number"
                      ? `${s.gpu.temp.toFixed(0)} °C`
                      : null,
                    typeof s.gpu.watts === "number"
                      ? `${s.gpu.watts.toFixed(0)} W`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  warn={85}
                  bad={97}
                />
                <Meter
                  label="VRAM"
                  pct={s.gpu.vram?.pct}
                  detail={s.gpu.vram ? size(s.gpu.vram) : undefined}
                  warn={85}
                  bad={95}
                />
              </>
            )}
          </div>
          {foot.length > 0 && (
            <p className="mt-auto pt-4 text-[12px] tabular-nums text-muted-foreground">
              {foot.join(" · ")}
            </p>
          )}
        </>
      ) : (
        <p className="mt-4 font-serif text-[15px] italic text-muted-foreground">
          {s
            ? "Asleep, off, or out of the tailnet."
            : "Add its Netdata address to see it live."}
        </p>
      )}
    </li>
  );
}

/**
 * "Machines" on the dashboard: every computer and VPS with its load, read
 * from Netdata through /api/machines/status. Refreshes while the tab is
 * visible.
 */
export function MachinesStatus() {
  const [machines, setMachines] = useState<MachineRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [editing, setEditing] = useState<MachineRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/machines/status", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { machines: MachineRow[] };
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
      if (document.visibilityState === "visible") await load();
      if (alive.current) timer = setTimeout(tick, REFRESH_MS);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    tick();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive.current = false;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  const close = () => {
    setEditing(null);
    setCreating(false);
  };

  const call = async (url: string, init: RequestInit, done: string) => {
    setBusy(true);
    try {
      const res = await fetch(url, {
        ...init,
        headers: { "content-type": "application/json" },
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          details?: { fieldErrors?: Record<string, string[]> };
        };
        const field = data.details?.fieldErrors
          ? Object.values(data.details.fieldErrors).flat()[0]
          : undefined;
        throw new Error(field || data.error || `Error ${res.status}`);
      }
      toast.success(done);
      close();
      await load();
    } catch (e) {
      toast.error("Could not save the machine", {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  };

  const save = (values: MachineValues) =>
    editing
      ? call(
          `/api/machines/${editing.id}`,
          { method: "PATCH", body: JSON.stringify(values) },
          "Machine updated."
        )
      : call(
          "/api/machines",
          { method: "POST", body: JSON.stringify(values) },
          "Machine added."
        );

  const remove = () => {
    if (!editing) return;
    const n = editing.projects;
    const warning =
      n > 0
        ? `Delete ${editing.label || editing.name}? It also forgets where ${n} project${n > 1 ? "s" : ""} live${n > 1 ? "" : "s"} on it.`
        : `Delete ${editing.label || editing.name}?`;
    if (!window.confirm(warning)) return;
    call(
      `/api/machines/${editing.id}`,
      { method: "DELETE" },
      "Machine deleted."
    );
  };

  const watched = machines?.filter((m) => m.stats) ?? [];
  const up = watched.filter((m) => m.stats?.online).length;

  return (
    <section className="tile mt-5 p-7 md:p-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <p className="etiquette">Machines</p>
          {watched.length > 0 && (
            <Badge
              variant={up === watched.length ? "positive" : "pending"}
              className="px-2.5 py-0.5 text-[11px]"
            >
              {up} of {watched.length} online
            </Badge>
          )}
          {failed && (
            <span className="text-[12px] text-negative-foreground">
              status unavailable
            </span>
          )}
        </div>
        <Button variant="secondary" size="sm" onClick={() => setCreating(true)}>
          <Plus /> Add machine
        </Button>
      </div>

      {machines === null ? (
        <ul className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <li
              key={i}
              className="h-[210px] animate-pulse rounded-[20px] bg-secondary"
            />
          ))}
        </ul>
      ) : machines.length === 0 ? (
        <p className="mt-4 max-w-xl text-[14px] text-muted-foreground">
          No machine yet. Add one with the address of its Netdata agent to
          follow its load from here.
        </p>
      ) : (
        <ul className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {machines.map((m) => (
            <MachineCard key={m.id} machine={m} onEdit={() => setEditing(m)} />
          ))}
        </ul>
      )}

      <MachineDialog
        key={editing?.id ?? (creating ? "new" : "closed")}
        open={!!editing || creating}
        machine={editing}
        busy={busy}
        onClose={close}
        onSave={save}
        onDelete={remove}
      />
    </section>
  );
}
