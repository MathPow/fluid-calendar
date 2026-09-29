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

const KINDS = [
  {
    id: "local",
    label: "Machine locale",
    hint: "Un ordi à la maison ou au bureau",
  },
  { id: "vps", label: "VPS", hint: "Un serveur loué (OVH…)" },
] as const;

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
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {machine ? "Modifier la machine" : "Nouvelle machine"}
          </DialogTitle>
          <DialogDescription>
            Comment la joindre, et l&apos;adresse de son terminal pour ouvrir un
            projet directement dans son dossier.
          </DialogDescription>
        </DialogHeader>
        <form
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
                  {k.label}
                </span>
                <span className="block text-[12px] text-muted-foreground">
                  {k.hint}
                </span>
              </button>
            ))}
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            {field(
              "label",
              "Nom affiché",
              v.kind === "vps" ? "VPS Dehors" : "Bureau"
            )}
            {field("name", "Nom d'hôte", "vps-9a93d71e", {
              mono: true,
              hint: "Ce que renvoie « hostname » : le hook s'en sert pour la reconnaître.",
            })}
            {field(
              "host",
              "Adresse (DNS / Tailscale)",
              "mathpow.taila15d52.ts.net",
              {
                mono: true,
              }
            )}
            {field("ip", "IP", "100.76.192.10", { mono: true })}
            {field("sshUser", "Utilisateur SSH", "ubuntu", { mono: true })}
            {field("sshKey", "Clé SSH (chemin)", "~/.ssh/id_ed25519", {
              mono: true,
              hint: "Le chemin seulement, jamais la clé.",
            })}
            {field(
              "provider",
              "Fournisseur",
              v.kind === "vps" ? "OVH" : "Maison"
            )}
            {field(
              "ttydUrl",
              "Terminal (ttyd)",
              "https://mathpow.taila15d52.ts.net:7681/",
              {
                mono: true,
                inputMode: "url",
              }
            )}
            {field(
              "statsUrl",
              "Stats (Netdata)",
              "http://100.76.192.10:19999",
              {
                mono: true,
                inputMode: "url",
                hint: "Avec l'IP Tailscale (tailscale ip -4) plutôt que le nom : c'est le serveur de DreamDash qui la lit.",
              }
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="machine-notes">Notes</Label>
            <Textarea
              id="machine-notes"
              value={text("notes")}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Ce qui tourne dessus, les pièges…"
              rows={3}
            />
          </div>

          <div className="flex flex-col-reverse gap-2 border-t border-border pt-5 sm:flex-row sm:items-center">
            {machine && onDelete && (
              <Button
                type="button"
                variant="ghost"
                className="text-negative-foreground hover:bg-negative hover:text-negative-foreground sm:mr-auto"
                onClick={onDelete}
                disabled={busy}
              >
                <Trash2 /> Supprimer
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={busy}
              className="sm:ml-auto"
            >
              Annuler
            </Button>
            <Button type="submit" disabled={busy || !v.name.trim()}>
              {machine ? "Enregistrer" : "Ajouter"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
