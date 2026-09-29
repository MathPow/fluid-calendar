"use client";

import {
  type Health,
  type Level,
  type Metric,
  levelOf,
} from "@/lib/machines/health";
import type { MachineStats, Usage } from "@/lib/machines/netdata";
import { cn } from "@/lib/utils";

const DOT: Record<Health, string> = {
  ok: "bg-[#2f9e68]",
  warn: "bg-[#e0a526]",
  bad: "bg-[#d8503f]",
  off: "bg-[#d8503f]",
  none: "bg-foreground/25",
};

/** Green, yellow or red; grey when the machine is not monitored. */
export function StatusDot({
  health,
  className,
}: {
  health: Health;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "h-2.5 w-2.5 shrink-0 rounded-full",
        DOT[health],
        className
      )}
      aria-hidden
    />
  );
}

const FILL: Record<Level, string> = {
  ok: "bg-foreground/70",
  warn: "bg-[#e0a526]",
  bad: "bg-[#d8503f]",
};

const round = (v: number) => (v >= 10 ? v.toFixed(0) : v.toFixed(1));

const size = (u: Usage) =>
  u.total >= 100
    ? `${u.used.toFixed(0)} / ${u.total.toFixed(0)} Go`
    : `${u.used.toFixed(1)} / ${u.total.toFixed(1)} Go`;

const rate = (kbps: number) =>
  kbps >= 1000 ? `${(kbps / 1000).toFixed(1)} Mb/s` : `${kbps.toFixed(0)} kb/s`;

function uptime(seconds: number) {
  const d = Math.floor(seconds / 86400);
  if (d >= 1) return `allumée depuis ${d} j`;
  const h = Math.floor(seconds / 3600);
  if (h >= 1) return `allumée depuis ${h} h`;
  return `allumée depuis ${Math.max(1, Math.floor(seconds / 60))} min`;
}

function Meter({
  label,
  pct,
  detail,
  metric,
}: {
  label: string;
  pct: number | null | undefined;
  detail?: string;
  /** Without one the bar stays neutral: a busy GPU is not a problem. */
  metric?: Metric;
}) {
  const known = typeof pct === "number";
  const level: Level = known && metric ? levelOf(metric, pct) : "ok";
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="etiquette">{label}</span>
        <span className="min-w-0 truncate text-[12px] text-muted-foreground">
          {detail && <span className="mr-2">{detail}</span>}
          <span className="text-[13px] font-semibold tabular-nums text-foreground">
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
            FILL[level]
          )}
          style={{ width: `${known ? Math.max(2, Math.min(100, pct)) : 0}%` }}
        />
      </div>
    </div>
  );
}

function Temperature({ value, metric }: { value: number; metric: Metric }) {
  const level = levelOf(metric, value);
  return (
    <span
      className={cn(
        level === "warn" && "font-semibold text-[#b07d12] dark:text-[#e0a526]",
        level === "bad" && "font-semibold text-[#d8503f]"
      )}
    >
      {value.toFixed(0)} °C
    </span>
  );
}

/** The live meters of one machine that answers. */
export function MachineMeters({ stats }: { stats: MachineStats }) {
  const s = stats;
  const foot: React.ReactNode[] = [];
  if (typeof s.temp === "number")
    foot.push(<Temperature key="t" value={s.temp} metric="temp" />);
  if (typeof s.load === "number") foot.push(`charge ${s.load.toFixed(2)}`);
  if (s.net) foot.push(`↓ ${rate(s.net.rx)} · ↑ ${rate(s.net.tx)}`);
  if (s.power) foot.push(`${s.power.watts.toFixed(0)} W`);
  if (typeof s.uptime === "number") foot.push(uptime(s.uptime));

  return (
    <div>
      <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        <Meter label="CPU" pct={s.cpu} metric="cpu" />
        <Meter
          label="RAM"
          pct={s.ram?.pct}
          detail={s.ram ? size(s.ram) : undefined}
          metric="ram"
        />
        <Meter
          label="Disque"
          pct={s.disk?.pct}
          detail={s.disk ? size(s.disk) : undefined}
          metric="disk"
        />
        {s.gpu && (
          <>
            <Meter
              label="GPU"
              pct={s.gpu.util}
              detail={
                typeof s.gpu.watts === "number"
                  ? `${s.gpu.watts.toFixed(0)} W`
                  : undefined
              }
            />
            <Meter
              label="VRAM"
              pct={s.gpu.vram?.pct}
              detail={s.gpu.vram ? size(s.gpu.vram) : undefined}
            />
          </>
        )}
      </div>
      {(foot.length > 0 || typeof s.gpu?.temp === "number") && (
        <p className="mt-3 text-[12px] tabular-nums text-muted-foreground">
          {foot.map((f, i) => (
            <span key={i}>
              {i > 0 && " · "}
              {f}
            </span>
          ))}
          {typeof s.gpu?.temp === "number" && (
            <span>
              {foot.length > 0 && " · "}GPU{" "}
              <Temperature value={s.gpu.temp} metric="gpuTemp" />
            </span>
          )}
        </p>
      )}
    </div>
  );
}
