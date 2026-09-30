"use client";

import { useEffect, useState } from "react";

import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  DESKTOP_ACTIONS,
  type DesktopAction,
  agentOnline,
  describeCommand,
} from "@/lib/desktop-actions";
import {
  LAUNCHER_ICONS,
  type LauncherIconId,
  type LauncherRow,
} from "@/lib/launchers";
import { cn } from "@/lib/utils";

import { ICON_FOR_ACTION, LauncherIcon } from "./LauncherIcon";
import {
  reloadLaunchers,
  useLauncherStore,
  useLaunchers,
} from "./useLaunchers";

type MachineOpt = {
  id: string;
  name: string;
  label: string | null;
  agentSeenAt: string | null;
};

// The fields each action asks for, in order.
const FIELDS: Record<
  DesktopAction,
  { key: string; label: string; placeholder: string; mono?: boolean }[]
> = {
  open_url: [
    { key: "url", label: "Adresse", placeholder: "https://…", mono: true },
  ],
  open_path: [
    {
      key: "path",
      label: "Dossier ou fichier",
      placeholder: "/home/mathys/Téléchargements",
      mono: true,
    },
  ],
  open_code: [
    {
      key: "path",
      label: "Dossier du projet",
      placeholder: "/home/mathys/repos/…",
      mono: true,
    },
  ],
  open_app: [
    {
      key: "app",
      label: "Application (.desktop)",
      placeholder: "firefox, org.gnome.Nautilus…",
      mono: true,
    },
  ],
  notify: [
    { key: "title", label: "Titre", placeholder: "Pause" },
    { key: "body", label: "Texte", placeholder: "Va boire de l'eau" },
  ],
  clipboard: [{ key: "text", label: "Texte à copier", placeholder: "…" }],
  lock: [],
  shell: [
    {
      key: "command",
      label: "Commande (confirmée sur l'ordi)",
      placeholder: "git -C ~/repos/dreamdash pull",
      mono: true,
    },
    {
      key: "cwd",
      label: "Dossier (facultatif)",
      placeholder: "/home/mathys",
      mono: true,
    },
  ],
};

type Form = {
  id?: string;
  label: string;
  icon: LauncherIconId;
  machineId: string;
  action: DesktopAction;
  args: Record<string, string>;
};

const blank = (machineId = ""): Form => ({
  label: "",
  icon: "code",
  machineId,
  action: "open_code",
  args: {},
});

/** Account menu ▸ « Gérer les raccourcis »: create, edit, order, delete. */
export function LaunchersDialog() {
  const { items, manageOpen, set } = useLaunchers();
  const [machines, setMachines] = useState<MachineOpt[]>([]);
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!manageOpen) return;
    reloadLaunchers();
    fetch("/api/machines")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: MachineOpt[]) => setMachines(rows))
      .catch(() => {});
  }, [manageOpen]);

  const withAgent = machines.filter((m) => m.agentSeenAt);
  const close = () => {
    set({ manageOpen: false });
    setForm(null);
  };

  const save = async () => {
    if (!form) return;
    setBusy(true);
    try {
      const args = Object.fromEntries(
        Object.entries(form.args)
          .filter(([, v]) => v.trim() !== "")
          .map(([k, v]) => [k, v.trim()])
      );
      const r = await fetch(
        form.id ? `/api/launchers/${form.id}` : "/api/launchers",
        {
          method: form.id ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            label: form.label,
            icon: form.icon,
            machineId: form.machineId,
            action: form.action,
            args,
          }),
        }
      );
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error || `Erreur ${r.status}`);
      setForm(null);
      reloadLaunchers();
    } catch (e) {
      toast.error("Enregistrement impossible", {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  };

  const move = async (i: number, delta: number) => {
    const next = [...items];
    const j = i + delta;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    useLauncherStore.getState().set({ items: next });
    await fetch("/api/launchers/order", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: next.map((l) => l.id) }),
    }).catch(() => {});
  };

  const remove = async (l: LauncherRow) => {
    if (!window.confirm(`Supprimer le raccourci « ${l.label} » ?`)) return;
    await fetch(`/api/launchers/${l.id}`, { method: "DELETE" }).catch(() => {});
    reloadLaunchers();
  };

  const edit = (l: LauncherRow) =>
    setForm({
      id: l.id,
      label: l.label,
      icon: (LAUNCHER_ICONS as readonly string[]).includes(l.icon)
        ? (l.icon as LauncherIconId)
        : "zap",
      machineId: l.machine.id,
      action: l.action as DesktopAction,
      args: Object.fromEntries(
        Object.entries(l.args).map(([k, v]) => [k, String(v ?? "")])
      ),
    });

  return (
    <Dialog open={manageOpen} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Raccourcis</DialogTitle>
          <DialogDescription>
            Des boutons dans le menu du profil qui lancent une commande sur une
            de tes machines. Une commande shell attend toujours ton « Exécuter »
            sur l&apos;ordi.
          </DialogDescription>
        </DialogHeader>

        {!form ? (
          <>
            {items.length === 0 ? (
              <p className="rounded-2xl bg-secondary/60 px-4 py-6 text-center text-[13px] text-muted-foreground">
                Aucun raccourci. Crée-en un, ou touche ☆ sur une commande dans
                Machines ▸ Commandes.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {items.map((l, i) => (
                  <li
                    key={l.id}
                    className="flex items-center gap-2.5 rounded-2xl bg-secondary/60 py-2 pl-3 pr-1.5"
                  >
                    <LauncherIcon icon={l.icon} className="h-4 w-4 shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-semibold">
                        {l.label}
                      </span>
                      <span className="block truncate text-[12px] text-muted-foreground">
                        {l.machine.label || l.machine.name} ·{" "}
                        {describeCommand(l.action, l.args)}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => move(i, -1)}
                      disabled={i === 0}
                      className="rounded-full p-1.5 text-muted-foreground hover:bg-card disabled:opacity-30"
                      aria-label={`Monter ${l.label}`}
                    >
                      <ArrowUp className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(i, 1)}
                      disabled={i === items.length - 1}
                      className="rounded-full p-1.5 text-muted-foreground hover:bg-card disabled:opacity-30"
                      aria-label={`Descendre ${l.label}`}
                    >
                      <ArrowDown className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => edit(l)}
                      className="rounded-full p-1.5 text-muted-foreground hover:bg-card"
                      aria-label={`Modifier ${l.label}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(l)}
                      className="rounded-full p-1.5 text-muted-foreground hover:bg-negative hover:text-negative-foreground"
                      aria-label={`Supprimer ${l.label}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex justify-end">
              <Button
                onClick={() => setForm(blank(withAgent[0]?.id ?? ""))}
                disabled={withAgent.length === 0}
              >
                <Plus /> Nouveau raccourci
              </Button>
            </div>
            {withAgent.length === 0 && machines.length > 0 && (
              <p className="text-[12px] text-muted-foreground">
                Aucune machine n&apos;a d&apos;agent : Machines ▸ Commandes ▸
                Connecter l&apos;agent.
              </p>
            )}
          </>
        ) : (
          <form
            className="space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="launcher-label">Libellé</Label>
              <Input
                id="launcher-label"
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                placeholder="DreamDash dans VS Code"
                maxLength={40}
              />
            </div>
            <div className="space-y-2">
              <Label>Icône</Label>
              <div className="flex flex-wrap gap-1.5">
                {LAUNCHER_ICONS.map((ic) => (
                  <button
                    key={ic}
                    type="button"
                    onClick={() => setForm({ ...form, icon: ic })}
                    aria-pressed={form.icon === ic}
                    aria-label={ic}
                    className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-xl transition-colors",
                      form.icon === ic
                        ? "bg-foreground text-background"
                        : "bg-secondary hover:bg-border/70"
                    )}
                  >
                    <LauncherIcon icon={ic} className="h-4 w-4" />
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Machine</Label>
                <Select
                  value={form.machineId}
                  onValueChange={(v) => setForm({ ...form, machineId: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Machine" />
                  </SelectTrigger>
                  <SelectContent>
                    {withAgent.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.label || m.name}
                        {!agentOnline(m.agentSeenAt) && (
                          <span className="text-muted-foreground">
                            {" "}
                            · hors ligne
                          </span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Action</Label>
                <Select
                  value={form.action}
                  onValueChange={(v) =>
                    setForm({
                      ...form,
                      action: v as DesktopAction,
                      args: {},
                      icon: ICON_FOR_ACTION[v] ?? form.icon,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(DESKTOP_ACTIONS) as DesktopAction[]).map(
                      (a) => (
                        <SelectItem key={a} value={a}>
                          {DESKTOP_ACTIONS[a].label}
                        </SelectItem>
                      )
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {FIELDS[form.action].map((f) => (
              <div key={f.key} className="space-y-2">
                <Label htmlFor={`launcher-${f.key}`}>{f.label}</Label>
                <Input
                  id={`launcher-${f.key}`}
                  value={form.args[f.key] ?? ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      args: { ...form.args, [f.key]: e.target.value },
                    })
                  }
                  placeholder={f.placeholder}
                  spellCheck={false}
                  autoCapitalize="off"
                  className={cn(f.mono && "font-mono text-[13px]")}
                />
              </div>
            ))}
            <div className="flex justify-end gap-2 border-t border-border pt-5">
              <Button
                type="button"
                variant="outline"
                onClick={() => setForm(null)}
                disabled={busy}
              >
                Annuler
              </Button>
              <Button
                type="submit"
                disabled={busy || !form.label.trim() || !form.machineId}
              >
                {form.id ? "Enregistrer" : "Créer"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
