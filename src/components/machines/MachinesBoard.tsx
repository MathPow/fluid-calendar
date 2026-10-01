"use client";

import { useState } from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  Copy,
  Laptop,
  MonitorSmartphone,
  Pencil,
  Plus,
  Server,
  TerminalSquare,
} from "lucide-react";
import { toast } from "sonner";

import { ContactsSwitch } from "@/components/projets/ContactsSwitch";
import {
  MachineDialog,
  type MachineLite,
  type MachineValues,
} from "@/components/projets/MachineDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { useT } from "@/i18n/client";
import { machineHealth } from "@/lib/machines/health";
import { DEFAULT_PROJECT_COLOR } from "@/lib/projets/meta";

import { DesktopCommandsDialog } from "./DesktopCommandsDialog";
import { MachineMeters, StatusDot } from "./MachineMeters";
import { useMachineStatus } from "./useMachineStatus";

export type MachineRow = MachineLite & {
  locations: {
    id: string;
    path: string;
    project: { id: string; slug: string; name: string; color: string | null };
  }[];
};

const SECTIONS = [
  { kind: "local", titleKey: "machines.sections.local", icon: Laptop },
  { kind: "vps", titleKey: "machines.sections.vps", icon: Server },
] as const;

/** The SSH command for a machine, when there's enough to build one. */
function sshCommand(m: MachineLite): string | null {
  const target = m.host || m.ip;
  if (!target) return null;
  const key = m.sshKey ? `-i ${m.sshKey} ` : "";
  return `ssh ${key}${m.sshUser ? `${m.sshUser}@` : ""}${target}`;
}

/**
 * The Machines tab: local machines and VPS with how to reach them, their web
 * terminal, their live load, and the projects that live on each.
 */
export function MachinesBoard({ machines }: { machines: MachineRow[] }) {
  const t = useT();
  const router = useRouter();
  const [dialog, setDialog] = useState<{ machine: MachineRow | null } | null>(
    null
  );
  const [commandsFor, setCommandsFor] = useState<MachineRow | null>(null);
  const [busy, setBusy] = useState(false);
  const { machines: live } = useMachineStatus();
  const statsOf = (id: string) => live?.find((l) => l.id === id)?.stats ?? null;

  const send = async (url: string, init: RequestInit, done: string) => {
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
        throw new Error(
          field || data.error || t("common.error", { status: res.status })
        );
      }
      toast.success(done);
      setDialog(null);
      router.refresh();
    } catch (e) {
      toast.error(t("machines.toasts.actionFailed"), {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  };

  const save = (values: MachineValues) => {
    const m = dialog?.machine;
    return m
      ? send(
          `/api/machines/${m.id}`,
          { method: "PATCH", body: JSON.stringify(values) },
          t("machines.toasts.updated")
        )
      : send(
          "/api/machines",
          { method: "POST", body: JSON.stringify(values) },
          t("machines.toasts.added")
        );
  };

  const remove = () => {
    const m = dialog?.machine;
    if (!m) return;
    const n = m.locations.length;
    const confirmMsg =
      n > 0
        ? t(
            n > 1
              ? "machines.confirm.deleteWithLocationsPlural"
              : "machines.confirm.deleteWithLocations",
            { name: m.label || m.name, count: n }
          )
        : t("machines.confirm.delete", { name: m.label || m.name });
    const ok = window.confirm(confirmMsg);
    if (ok)
      send(
        `/api/machines/${m.id}`,
        { method: "DELETE" },
        t("machines.toasts.deleted")
      );
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t("machines.toasts.copied"));
    } catch {
      toast.error(t("machines.toasts.copyFailed"));
    }
  };

  const vpsCount = machines.filter((m) => m.kind === "vps").length;

  return (
    <div className="page pb-16 pt-8 md:pt-12">
      <header className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="display text-[44px] sm:text-[64px] md:text-[80px]">
            {t("machines.pageTitle")}
          </h1>
          <div className="mt-6 flex flex-wrap gap-2">
            <Badge className="px-4 py-2 text-[13px]">
              {t(
                machines.length - vpsCount > 1
                  ? "machines.badges.localPlural"
                  : "machines.badges.local",
                { count: machines.length - vpsCount }
              )}
            </Badge>
            <Badge className="px-4 py-2 text-[13px]">
              {t("machines.badges.vps", { count: vpsCount })}
            </Badge>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <ContactsSwitch />
          <Button size="lg" onClick={() => setDialog({ machine: null })}>
            <Plus /> {t("machines.newMachine")}
          </Button>
        </div>
      </header>
      <div className="filet mt-8" />

      {SECTIONS.map(({ kind, titleKey, icon: Icon }) => {
        const list = machines.filter(
          (m) => (m.kind === "vps" ? "vps" : "local") === kind
        );
        return (
          <section key={kind} className="mt-10">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-secondary text-muted-foreground">
                <Icon className="h-5 w-5" />
              </span>
              <h2 className="text-[24px] font-bold leading-none tracking-title">
                {t(titleKey)}
              </h2>
              <span className="text-[12px] text-muted-foreground">
                {list.length}
              </span>
            </div>
            {list.length === 0 ? (
              <p className="mt-4 rounded-[20px] bg-secondary/60 px-5 py-6 text-center text-[13px] text-muted-foreground">
                {t("machines.sectionEmpty")}
              </p>
            ) : (
              <ul className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
                {list.map((m) => {
                  const ssh = sshCommand(m);
                  const stats = statsOf(m.id);
                  // Until the first reading arrives, say nothing rather than "offline".
                  const waiting = !!m.statsUrl && live === null;
                  const { health } = machineHealth(stats);
                  return (
                    <li
                      key={m.id}
                      className="tile flex min-w-0 flex-col p-5 md:p-6"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="flex items-center gap-2.5 text-[19px] font-bold leading-tight tracking-title">
                            {!waiting && <StatusDot health={health} />}
                            <span className="truncate">
                              {m.label || m.name}
                            </span>
                          </h3>
                          <p className="mt-0.5 truncate font-mono text-[12px] text-muted-foreground">
                            {m.name}
                            {m.provider && ` · ${m.provider}`}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          {m.ttydUrl && (
                            <Button variant="outline" size="sm" asChild>
                              <a
                                href={m.ttydUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <TerminalSquare /> {t("machines.terminal")}
                              </a>
                            </Button>
                          )}
                          {m.kind !== "vps" && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setCommandsFor(m)}
                            >
                              <MonitorSmartphone /> {t("machines.commands")}
                            </Button>
                          )}
                          <button
                            type="button"
                            onClick={() => setDialog({ machine: m })}
                            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
                            aria-label={t("machines.editAria", {
                              name: m.label || m.name,
                            })}
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                        </div>
                      </div>

                      {stats?.online ? (
                        <div className="mt-4 rounded-2xl bg-secondary/60 p-4">
                          <MachineMeters stats={stats} />
                        </div>
                      ) : waiting ? (
                        <div className="mt-4 h-[120px] animate-pulse rounded-2xl bg-secondary/60" />
                      ) : (
                        <p className="mt-4 rounded-2xl bg-secondary/60 px-4 py-3 text-[13px] text-muted-foreground">
                          {stats
                            ? t("machines.offlineHint")
                            : t("machines.noStatsHint")}
                        </p>
                      )}

                      <dl className="mt-4 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-[13px]">
                        {m.host && (
                          <>
                            <dt className="etiquette self-center">
                              {t("machines.address")}
                            </dt>
                            <dd className="truncate font-mono">{m.host}</dd>
                          </>
                        )}
                        {m.ip && (
                          <>
                            <dt className="etiquette self-center">IP</dt>
                            <dd className="truncate font-mono">{m.ip}</dd>
                          </>
                        )}
                        {ssh && (
                          <>
                            <dt className="etiquette self-center">SSH</dt>
                            <dd className="flex min-w-0 items-center gap-1">
                              <code className="truncate">{ssh}</code>
                              <button
                                type="button"
                                onClick={() => copy(ssh)}
                                className="shrink-0 rounded-full p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                                aria-label={t("machines.copySshAria")}
                              >
                                <Copy className="h-3.5 w-3.5" />
                              </button>
                            </dd>
                          </>
                        )}
                      </dl>

                      {m.notes && (
                        <p className="mt-3 line-clamp-3 whitespace-pre-line text-[13px] text-muted-foreground">
                          {m.notes}
                        </p>
                      )}

                      {m.locations.length > 0 && (
                        <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-4">
                          {m.locations.slice(0, 8).map((l) => (
                            <Link
                              key={l.id}
                              href={`/projets/${encodeURIComponent(l.project.slug)}`}
                              title={l.path}
                              className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-[12px] font-medium hover:bg-border/70"
                            >
                              <span
                                className="h-2 w-2 rounded-full"
                                style={{
                                  backgroundColor:
                                    l.project.color ?? DEFAULT_PROJECT_COLOR,
                                }}
                              />
                              {l.project.name}
                            </Link>
                          ))}
                          {m.locations.length > 8 && (
                            <span className="text-[12px] text-muted-foreground">
                              {t("machines.extraProjects", {
                                count: m.locations.length - 8,
                              })}
                            </span>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}

      <DesktopCommandsDialog
        machine={commandsFor}
        onClose={() => setCommandsFor(null)}
      />
      <MachineDialog
        key={dialog ? (dialog.machine?.id ?? "new") : "closed"}
        open={!!dialog}
        machine={dialog?.machine ?? null}
        busy={busy}
        onClose={() => setDialog(null)}
        onSave={save}
        onDelete={remove}
      />
    </div>
  );
}
