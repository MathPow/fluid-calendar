"use client";

import Link from "next/link";

import { StatusDot } from "@/components/machines/MachineMeters";
import {
  type MachineStatusRow,
  useMachineStatus,
} from "@/components/machines/useMachineStatus";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { type Issue, type Metric, machineHealth } from "@/lib/machines/health";

const METRIC: Record<Metric, string> = {
  cpu: "CPU",
  ram: "RAM",
  disk: "disk",
  temp: "temp",
  gpuTemp: "GPU temp",
};

const issueText = (i: Issue) =>
  i.metric === "temp" || i.metric === "gpuTemp"
    ? `${METRIC[i.metric]} ${i.value.toFixed(0)} °C`
    : `${METRIC[i.metric]} ${i.value.toFixed(0)} %`;

function note(machine: MachineStatusRow) {
  const { health, issues } = machineHealth(machine.stats);
  if (health === "none") return "not monitored";
  if (health === "off") return "offline";
  if (health === "ok") return "all good";
  return issues.slice(0, 2).map(issueText).join(" · ");
}

/**
 * "Machines" on the dashboard: a glance — one dot per machine, green, yellow
 * or red. The meters themselves live in the Machines tab.
 */
export function MachinesStatus({ embedded = false }: { embedded?: boolean }) {
  const { machines: rows, failed } = useMachineStatus(10000);
  // Same order on every refresh; the ones that are not monitored go last.
  const machines = rows
    ? [...rows.filter((m) => m.stats), ...rows.filter((m) => !m.stats)]
    : null;

  const healths = (machines ?? []).map((m) => machineHealth(m.stats).health);
  const red = healths.filter((h) => h === "bad" || h === "off").length;
  const yellow = healths.filter((h) => h === "warn").length;
  const watched = healths.filter((h) => h !== "none").length;

  return (
    <section
      className={embedded ? "h-full overflow-y-auto" : "tile mt-5 p-7 md:p-10"}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <p className="etiquette mr-1">Machines</p>
          {watched > 0 && red === 0 && yellow === 0 && (
            <Badge variant="positive" className="px-2.5 py-0.5 text-[11px]">
              All good
            </Badge>
          )}
          {red > 0 && (
            <Badge variant="negative" className="px-2.5 py-0.5 text-[11px]">
              {red} need{red > 1 ? "" : "s"} attention
            </Badge>
          )}
          {yellow > 0 && (
            <Badge variant="pending" className="px-2.5 py-0.5 text-[11px]">
              {yellow} to watch
            </Badge>
          )}
          {failed && (
            <span className="text-[12px] text-negative-foreground">
              status unavailable
            </span>
          )}
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/machines">All machines</Link>
        </Button>
      </div>

      {machines === null ? (
        <ul className="mt-5 flex flex-wrap gap-2">
          {[0, 1, 2].map((i) => (
            <li
              key={i}
              className="h-10 w-40 animate-pulse rounded-full bg-secondary"
            />
          ))}
        </ul>
      ) : machines.length === 0 ? (
        <p className="mt-4 text-[14px] text-muted-foreground">
          No machine yet. Add one in the Machines tab.
        </p>
      ) : (
        <ul className="mt-5 flex flex-wrap gap-2">
          {machines.map((m) => (
            <li key={m.id}>
              <Link
                href="/machines"
                className="flex h-10 items-center gap-2.5 rounded-full bg-secondary px-4 transition-colors hover:bg-border/70"
              >
                <StatusDot health={machineHealth(m.stats).health} />
                <span className="text-[14px] font-semibold tracking-title">
                  {m.label || m.name}
                </span>
                <span className="text-[12px] tabular-nums text-muted-foreground">
                  {note(m)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
