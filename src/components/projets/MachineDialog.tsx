"use client";

import { useState } from "react";

import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";

export interface MachineLite {
  id: string;
  name: string;
  label: string | null;
  ttydUrl: string | null;
  statsUrl: string | null;
  // Inventory fields: absent when the caller didn't load them.
  kind?: string;
  host?: string | null;
  ip?: string | null;
  sshUser?: string | null;
  sshKey?: string | null;
  provider?: string | null;
  notes?: string | null;
  agentSeenAt?: Date | string | null;
}

export type MachineValues = {
  name: string;
  label: string | null;
  ttydUrl: string | null;
  statsUrl: string | null;
  kind?: "local" | "vps";
  host?: string | null;
  ip?: string | null;
  sshUser?: string | null;
  sshKey?: string | null;
  provider?: string | null;
  notes?: string | null;
};

type FormValues = Required<MachineValues>;

const KINDS = [{ id: "local" }, { id: "vps" }] as const;

/**
 * Create / edit a machine: how the activity hook knows it (hostname), how it's
 * reached (host, IP, SSH user and key path), its web terminal, its Netdata
 * address for the dashboard, and notes. Shared by the Machines tab, the
 * dashboard's live status and a project's « Emplacements ». No secrets: only
 * the path of an SSH key, never the key itself. Give it a `key` that changes
 * with the machine being edited so the fields start from the right values.
 */
export function MachineDialog({
  open,
  machine,
  busy,
  onClose,
  onSave,
  onDelete,
}: {
  open: boolean;
  machine: MachineLite | null;
  busy: boolean;
  onClose: () => void;
  onSave: (values: MachineValues) => void;
  onDelete?: () => void;
}) {
  const t = useT();
  // A machine loaded without its inventory (older callers) must not have those
  // fields blanked on save: they're only sent when they were loaded.
  const hasInventory = !machine || "kind" in machine;
  const [v, setV] = useState<FormValues>({
    name: machine?.name ?? "",
    label: machine?.label ?? "",
    ttydUrl: machine?.ttydUrl ?? "",
    statsUrl: machine?.statsUrl ?? "",
    kind: machine?.kind === "vps" ? "vps" : "local",
    host: machine?.host ?? "",
    ip: machine?.ip ?? "",
    sshUser: machine?.sshUser ?? "",
    sshKey: machine?.sshKey ?? "",
    provider: machine?.provider ?? "",
    notes: machine?.notes ?? "",
  });
  const set = (key: keyof FormValues, value: string) =>
    setV((prev) => ({ ...prev, [key]: value }));
  const text = (key: keyof FormValues) => (v[key] as string | null) ?? "";

  const field = (
    key: keyof FormValues,
    label: string,
    placeholder: string,
    extra?: { mono?: boolean; hint?: string; inputMode?: "url" | "text" }
  ) => (
    <div className="space-y-2">
      <Label htmlFor={`machine-${key}`}>{label}</Label>
      <Input
        id={`machine-${key}`}
        value={text(key)}
        onChange={(e) => set(key, e.target.value)}
        placeholder={placeholder}
        inputMode={extra?.inputMode}
        spellCheck={false}
        className={cn(extra?.mono && "font-mono text-[13px]")}
      />
      {extra?.hint && (
        <p className="text-[12px] text-muted-foreground">{extra.hint}</p>
      )}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex flex-col gap-0 overflow-y-hidden p-0 md:p-0 max-w-2xl">
        <DialogHeader className="space-y-1.5 px-6 pb-4 pt-6 md:px-8 md:pt-8">
          <DialogTitle>
            {machine
              ? t("projects.machineDialog.title.edit")
              : t("projects.machineDialog.title.new")}
          </DialogTitle>
          <DialogDescription>
            {t("projects.machineDialog.desc")}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 pb-6 md:px-8 md:pb-8">
        <form
          id="machine-form"
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!v.name.trim()) return;
            const clean = (s: string | null) => (s ?? "").trim() || null;
            onSave({
              name: v.name.trim(),
              label: clean(v.label),
              ttydUrl: clean(v.ttydUrl),
              statsUrl: clean(v.statsUrl),
              ...(hasInventory
                ? {
                    kind: v.kind,
                    host: clean(v.host),
                    ip: clean(v.ip),
                    sshUser: clean(v.sshUser),
                    sshKey: clean(v.sshKey),
                    provider: clean(v.provider),
                    notes: clean(v.notes),
                  }
                : {}),
            });
          }}
        >
          <div className="grid gap-2 sm:grid-cols-2">
            {KINDS.map((k) => (
              <button
                key={k.id}
                type="button"
                onClick={() => setV((prev) => ({ ...prev, kind: k.id }))}
                aria-pressed={v.kind === k.id}
                className={cn(
                  "rounded-2xl border-2 px-4 py-3 text-left transition-colors",
                  v.kind === k.id
                    ? "border-foreground bg-tint-soft"
                    : "border-transparent bg-secondary hover:bg-border/70"
                )}
              >
                <span className="block text-[14px] font-semibold tracking-title">
                  {t(`projects.machineDialog.kinds.${k.id}.label`)}
                </span>
                <span className="block text-[12px] text-muted-foreground">
                  {t(`projects.machineDialog.kinds.${k.id}.hint`)}
                </span>
              </button>
            ))}
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            {field(
              "label",
              t("projects.machineDialog.fields.label"),
              v.kind === "vps"
                ? t("projects.machineDialog.fields.labelPlaceholder.vps")
                : t("projects.machineDialog.fields.labelPlaceholder.local")
            )}
            {field(
              "name",
              t("projects.machineDialog.fields.name"),
              t("projects.machineDialog.fields.namePlaceholder"),
              {
                mono: true,
                hint: t("projects.machineDialog.fields.nameHint"),
              }
            )}
            {field(
              "host",
              t("projects.machineDialog.fields.host"),
              t("projects.machineDialog.fields.hostPlaceholder"),
              {
                mono: true,
              }
            )}
            {field(
              "ip",
              t("projects.machineDialog.fields.ip"),
              t("projects.machineDialog.fields.ipPlaceholder"),
              { mono: true }
            )}
            {field(
              "sshUser",
              t("projects.machineDialog.fields.sshUser"),
              t("projects.machineDialog.fields.sshUserPlaceholder"),
              { mono: true }
            )}
            {field(
              "sshKey",
              t("projects.machineDialog.fields.sshKey"),
              t("projects.machineDialog.fields.sshKeyPlaceholder"),
              {
                mono: true,
                hint: t("projects.machineDialog.fields.sshKeyHint"),
              }
            )}
            {field(
              "provider",
              t("projects.machineDialog.fields.provider"),
              v.kind === "vps"
                ? t("projects.machineDialog.fields.providerPlaceholder.vps")
                : t("projects.machineDialog.fields.providerPlaceholder.local")
            )}
            {field(
              "ttydUrl",
              t("projects.machineDialog.fields.ttyd"),
              t("projects.machineDialog.fields.ttydPlaceholder"),
              {
                mono: true,
                inputMode: "url",
              }
            )}
            {field(
              "statsUrl",
              t("projects.machineDialog.fields.stats"),
              t("projects.machineDialog.fields.statsPlaceholder"),
              {
                mono: true,
                inputMode: "url",
                hint: t("projects.machineDialog.fields.statsHint"),
              }
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="machine-notes">
              {t("projects.machineDialog.fields.notes")}
            </Label>
            <Textarea
              id="machine-notes"
              value={text("notes")}
              onChange={(e) => set("notes", e.target.value)}
              placeholder={t(
                "projects.machineDialog.fields.notesPlaceholder"
              )}
              rows={3}
            />
          </div>

        </form>
        </div>

        <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-border bg-card px-6 py-4 md:px-8 sm:flex-row sm:items-center">
            {machine && onDelete && (
              <Button
                type="button"
                variant="ghost"
                className="text-negative-foreground hover:bg-negative hover:text-negative-foreground sm:mr-auto"
                onClick={onDelete}
                disabled={busy}
              >
                <Trash2 /> {t("projects.machineDialog.actions.delete")}
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={busy}
              className="sm:ml-auto"
            >
              {t("common.cancel")}
            </Button>
            <Button type="submit" form="machine-form" disabled={busy || !v.name.trim()}>
              {machine
                ? t("projects.machineDialog.actions.save")
                : t("projects.machineDialog.actions.create")}
            </Button>
          </div>
      </DialogContent>
    </Dialog>
  );
}
