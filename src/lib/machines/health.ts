import type { MachineStats } from "./netdata";

/**
 * One reading of a machine turned into a colour. The thresholds are the ones
 * the meters use, so the dot on the dashboard always agrees with the bars of
 * the Machines tab.
 */
export type Level = "ok" | "warn" | "bad";

/** "off": has a stats address but does not answer. "none": not monitored. */
export type Health = Level | "off" | "none";

export type Metric = "cpu" | "ram" | "disk" | "temp" | "gpuTemp";

// No `warn`: the metric goes straight from fine to red. A disk that fills up
// slowly is not worth a yellow dot for weeks, only a red one when it's urgent.
export const LIMITS: Record<Metric, { warn?: number; bad: number }> = {
  cpu: { warn: 70, bad: 90 },
  ram: { warn: 75, bad: 90 },
  disk: { bad: 92 },
  temp: { warn: 75, bad: 90 },
  gpuTemp: { warn: 75, bad: 85 },
};

export function levelOf(metric: Metric, value: number): Level {
  const { warn, bad } = LIMITS[metric];
  if (value >= bad) return "bad";
  return warn !== undefined && value >= warn ? "warn" : "ok";
}

export interface Issue {
  metric: Metric;
  value: number;
  level: Exclude<Level, "ok">;
}

export interface MachineHealth {
  health: Health;
  /** What is over its threshold, worst first. */
  issues: Issue[];
}

export function machineHealth(
  stats: MachineStats | null | undefined
): MachineHealth {
  if (!stats) return { health: "none", issues: [] };
  if (!stats.online) return { health: "off", issues: [] };

  const readings: [Metric, number | null | undefined][] = [
    ["cpu", stats.cpu],
    ["ram", stats.ram?.pct],
    ["disk", stats.disk?.pct],
    ["temp", stats.temp],
    ["gpuTemp", stats.gpu?.temp],
  ];
  const issues: Issue[] = [];
  for (const [metric, value] of readings) {
    if (typeof value !== "number") continue;
    const level = levelOf(metric, value);
    if (level !== "ok") issues.push({ metric, value, level });
  }
  issues.sort((a, b) => (a.level === b.level ? 0 : a.level === "bad" ? -1 : 1));

  return {
    health: issues.some((i) => i.level === "bad")
      ? "bad"
      : issues.length
        ? "warn"
        : "ok",
    issues,
  };
}
