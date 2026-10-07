"use client";

import { useEffect, useMemo, useState } from "react";

import {
  ArrowDown,
  ArrowUp,
  CalendarClock,
  Pencil,
  Plus,
  Trash2,
  Zap,
} from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

import {
  DESKTOP_ACTIONS,
  type DesktopAction,
  USER_DESKTOP_ACTION_IDS,
  agentOnline,
  describeCommand,
} from "@/lib/desktop-actions";
import {
  LAUNCHER_ICONS,
  LAUNCHER_RECURRENCES,
  type LauncherIconId,
  type LauncherKind,
  type LauncherRecurrence,
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
  host: string | null;
  sshUser: string | null;
};

// The fields each shell action asks for, in order.
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
  agent_run: [],
};

export const KIND_LABELS: Record<LauncherKind, string> = {
  shell: "Commande shell",
  "claude-prompt": "Prompt Claude",
  "codex-prompt": "Prompt Codex",
};

const RECURRENCE_LABELS: Record<LauncherRecurrence | "none", string> = {
  none: "Jamais",
  daily: "Chaque jour",
  weekly: "Chaque semaine",
  monthly: "Chaque mois",
};

type Form = {
  id?: string;
  label: string;
  icon: LauncherIconId;
  kind: LauncherKind;
  machineId: string;
  action: DesktopAction;
  args: Record<string, string>;
  promptText: string;
  scheduleOn: boolean;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  recurrence: LauncherRecurrence | "none";
};

/** Split an ISO date into local YYYY-MM-DD and HH:MM for the date/time inputs. */
function splitDate(iso: string | null): { date: string; time: string } {
  if (!iso) {
    const d = new Date();
    d.setMinutes(d.getMinutes() + 30);
    return {
      date: d.toISOString().slice(0, 10),
      time: d.toTimeString().slice(0, 5),
    };
  }
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

function combineDate(date: string, time: string): string | null {
  if (!date || !time) return null;
  const d = new Date(`${date}T${time}:00`);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function blank(kind: LauncherKind, machineId = ""): Form {
  const now = splitDate(null);
  return {
    label: "",
    icon:
      kind === "shell" ? "code" : kind === "claude-prompt" ? "zap" : "terminal",
    kind,
    machineId,
    action: "open_code",
    args: {},
    promptText: "",
    scheduleOn: false,
    date: now.date,
    time: now.time,
    recurrence: "none",
  };
}

export function scheduleLabel(scheduledFor: string, recurrence: string | null) {
  const d = new Date(scheduledFor);
  const when = d.toLocaleString("fr-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const suffix =
    recurrence && recurrence !== "none"
      ? ` · ${RECURRENCE_LABELS[recurrence as LauncherRecurrence]}`
      : "";
  return `${when}${suffix}`;
}

function runStatus(l: LauncherRow): string | null {
  if (l.lastError) return `Erreur : ${l.lastError}`;
  if (l.lastResult) {
    const tail = l.lastResult.trim().split("\n").slice(-1)[0] || "";
    return `Dernier run : ${tail.slice(0, 80)}`;
  }
  if (l.scheduledFor) return "En attente";
  return null;
}

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

  // Shell needs an agent; prompt kinds accept any machine with agent or ssh.
  const shellMachines = machines.filter((m) => m.agentSeenAt);
  const promptMachines = machines.filter(
    (m) => m.agentSeenAt || (m.host && m.sshUser)
  );

  const { instant, scheduled } = useMemo(() => {
    const scheduled = items.filter((l) => l.scheduledFor);
    const instant = items.filter((l) => !l.scheduledFor);
    return { instant, scheduled };
  }, [items]);

  const close = () => {
    set({ manageOpen: false });
    setForm(null);
  };

  const startCreate = (kind: LauncherKind) => {
    const pool = kind === "shell" ? shellMachines : promptMachines;
    setForm(blank(kind, pool[0]?.id ?? ""));
  };

  const save = async () => {
    if (!form) return;
    setBusy(true);
    try {
      const args =
        form.kind === "shell"
          ? Object.fromEntries(
              Object.entries(form.args)
                .filter(([, v]) => v.trim() !== "")
                .map(([k, v]) => [k, v.trim()])
            )
          : {};
      const scheduledFor =
        form.kind !== "shell" && form.scheduleOn
          ? combineDate(form.date, form.time)
          : null;
      const body: Record<string, unknown> = {
        label: form.label,
        icon: form.icon,
        kind: form.kind,
        machineId: form.machineId,
      };
      if (form.kind === "shell") {
        body.action = form.action;
        body.args = args;
      } else {
        body.promptText = form.promptText;
      }
      if (scheduledFor) body.scheduledFor = scheduledFor;
      if (scheduledFor && form.recurrence !== "none")
        body.recurrence = form.recurrence;
      const r = await fetch(
        form.id ? `/api/launchers/${form.id}` : "/api/launchers",
        {
          method: form.id ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      const respBody = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(respBody.error || `Erreur ${r.status}`);
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

  const edit = (l: LauncherRow) => {
    const kind = (l.kind || "shell") as LauncherKind;
    const dt = splitDate(l.scheduledFor);
    setForm({
      id: l.id,
      label: l.label,
      icon: (LAUNCHER_ICONS as readonly string[]).includes(l.icon)
        ? (l.icon as LauncherIconId)
        : "zap",
      kind,
      machineId: l.machine?.id ?? "",
      action: (kind === "shell"
        ? (l.action as DesktopAction)
        : "open_code") as DesktopAction,
      args:
        kind === "shell"
          ? Object.fromEntries(
              Object.entries(l.args).map(([k, v]) => [k, String(v ?? "")])
            )
          : {},
      promptText: l.promptText || "",
      scheduleOn: !!l.scheduledFor,
      date: dt.date,
      time: dt.time,
      recurrence: (l.recurrence as LauncherRecurrence | null) ?? "none",
    });
  };

  const canSubmit =
    form &&
    form.label.trim() &&
    (form.kind === "shell"
      ? form.machineId
      : form.machineId && form.promptText.trim());

  return (
    <Dialog open={manageOpen} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Raccourcis</DialogTitle>
          <DialogDescription>
            Des boutons dans le menu du profil qui lancent une commande, un
            prompt Claude ou Codex sur une de tes machines. Les prompts partent
            en mode sans permission — configure-les une fois, clique en
            confiance.
          </DialogDescription>
        </DialogHeader>

        {!form ? (
          <>
            <Tabs defaultValue="instant" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="instant" className="gap-1.5">
                  <Zap className="h-3.5 w-3.5" /> Instantanés
                </TabsTrigger>
                <TabsTrigger value="scheduled" className="gap-1.5">
                  <CalendarClock className="h-3.5 w-3.5" /> Événements
                </TabsTrigger>
              </TabsList>

              <TabsContent value="instant" className="mt-3 space-y-1.5">
                {instant.length === 0 ? (
                  <p className="rounded-2xl bg-secondary/60 px-4 py-6 text-center text-[13px] text-muted-foreground">
                    Aucun raccourci instantané pour le moment.
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {instant.map((l) => (
                      <LauncherLI
                        key={l.id}
                        l={l}
                        i={items.indexOf(l)}
                        total={items.length}
                        move={move}
                        edit={edit}
                        remove={remove}
                      />
                    ))}
                  </ul>
                )}
              </TabsContent>

              <TabsContent value="scheduled" className="mt-3 space-y-1.5">
                {scheduled.length === 0 ? (
                  <p className="rounded-2xl bg-secondary/60 px-4 py-6 text-center text-[13px] text-muted-foreground">
                    Aucun événement planifié.
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {scheduled.map((l) => (
                      <LauncherLI
                        key={l.id}
                        l={l}
                        i={items.indexOf(l)}
                        total={items.length}
                        move={move}
                        edit={edit}
                        remove={remove}
                      />
                    ))}
                  </ul>
                )}
              </TabsContent>
            </Tabs>

            <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
              <Button
                size="sm"
                variant="outline"
                onClick={() => startCreate("shell")}
                disabled={shellMachines.length === 0}
              >
                <Plus /> Commande shell
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => startCreate("claude-prompt")}
                disabled={promptMachines.length === 0}
              >
                <Plus /> Prompt Claude
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => startCreate("codex-prompt")}
                disabled={promptMachines.length === 0}
              >
                <Plus /> Prompt Codex
              </Button>
            </div>
            {promptMachines.length === 0 && machines.length > 0 && (
              <p className="text-[12px] text-muted-foreground">
                Aucune machine utilisable : ajoute un agent ou une adresse ssh
                dans Machines.
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
            <div className="flex items-center gap-2 rounded-full bg-secondary/70 px-3 py-1 text-[12px] font-medium text-muted-foreground">
              {KIND_LABELS[form.kind]}
            </div>
            <div className="space-y-2">
              <Label htmlFor="launcher-label">Libellé</Label>
              <Input
                id="launcher-label"
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                placeholder={
                  form.kind === "shell"
                    ? "DreamDash dans VS Code"
                    : "Résumé des mails du matin"
                }
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
                  {(form.kind === "shell" ? shellMachines : promptMachines).map(
                    (m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.label || m.name}
                        {!agentOnline(m.agentSeenAt) && (
                          <span className="text-muted-foreground">
                            {" "}
                            · {m.host && m.sshUser ? "via ssh" : "hors ligne"}
                          </span>
                        )}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
            </div>

            {form.kind === "shell" ? (
              <>
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
                      {USER_DESKTOP_ACTION_IDS.map((a) => (
                        <SelectItem key={a} value={a}>
                          {DESKTOP_ACTIONS[a].label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="launcher-prompt">
                    Prompt ({form.kind === "claude-prompt" ? "Claude" : "Codex"}{" "}
                    sans permission)
                  </Label>
                  <Textarea
                    id="launcher-prompt"
                    value={form.promptText}
                    onChange={(e) =>
                      setForm({ ...form, promptText: e.target.value })
                    }
                    placeholder={
                      form.kind === "claude-prompt"
                        ? "Résume les nouveaux mails et prépare une réponse en brouillon."
                        : "Corrige les warnings TypeScript dans src/ et commit."
                    }
                    rows={8}
                    className="font-mono text-[13px]"
                  />
                </div>
                <div className="space-y-3 rounded-2xl bg-secondary/50 p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label
                        htmlFor="launcher-schedule"
                        className="text-[13px] font-medium"
                      >
                        Planifier
                      </Label>
                      <p className="text-[11.5px] text-muted-foreground">
                        Un événement machine tire à la date/heure choisies.
                      </p>
                    </div>
                    <Switch
                      id="launcher-schedule"
                      checked={form.scheduleOn}
                      onCheckedChange={(v) =>
                        setForm({ ...form, scheduleOn: v })
                      }
                    />
                  </div>
                  {form.scheduleOn && (
                    <div className="grid gap-2 sm:grid-cols-3">
                      <div className="space-y-1.5">
                        <Label
                          htmlFor="launcher-date"
                          className="text-[11.5px]"
                        >
                          Date
                        </Label>
                        <Input
                          id="launcher-date"
                          type="date"
                          value={form.date}
                          onChange={(e) =>
                            setForm({ ...form, date: e.target.value })
                          }
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label
                          htmlFor="launcher-time"
                          className="text-[11.5px]"
                        >
                          Heure
                        </Label>
                        <Input
                          id="launcher-time"
                          type="time"
                          value={form.time}
                          onChange={(e) =>
                            setForm({ ...form, time: e.target.value })
                          }
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[11.5px]">Récurrence</Label>
                        <Select
                          value={form.recurrence}
                          onValueChange={(v) =>
                            setForm({
                              ...form,
                              recurrence: v as LauncherRecurrence | "none",
                            })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">
                              {RECURRENCE_LABELS.none}
                            </SelectItem>
                            {LAUNCHER_RECURRENCES.map((r) => (
                              <SelectItem key={r} value={r}>
                                {RECURRENCE_LABELS[r]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

            <div className="flex justify-end gap-2 border-t border-border pt-5">
              <Button
                type="button"
                variant="outline"
                onClick={() => setForm(null)}
                disabled={busy}
              >
                Annuler
              </Button>
              <Button type="submit" disabled={busy || !canSubmit}>
                {form.id ? "Enregistrer" : "Créer"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

type LILProps = {
  l: LauncherRow;
  i: number;
  total: number;
  move: (i: number, delta: number) => void;
  edit: (l: LauncherRow) => void;
  remove: (l: LauncherRow) => void;
};

function LauncherLI({ l, i, total, move, edit, remove }: LILProps) {
  const status = runStatus(l);
  const machineLabel = l.machine
    ? l.machine.label || l.machine.name
    : "sans machine";
  const summary =
    l.kind === "shell"
      ? describeCommand(l.action, l.args)
      : l.kind === "claude-prompt"
        ? `Claude · ${(l.promptText || "").slice(0, 60)}`
        : `Codex · ${(l.promptText || "").slice(0, 60)}`;
  return (
    <li className="flex flex-wrap items-center gap-2.5 rounded-2xl md:flex-nowrap bg-secondary/60 py-2 pl-3 pr-1.5">
      <LauncherIcon icon={l.icon} className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-semibold">
          {l.label}
        </span>
        <span className="block truncate text-[12px] text-muted-foreground">
          {machineLabel} · {summary}
        </span>
        {l.scheduledFor && (
          <span className="block truncate text-[11.5px] text-muted-foreground">
            <CalendarClock className="mr-1 inline h-3 w-3" />
            {scheduleLabel(l.scheduledFor, l.recurrence)}
          </span>
        )}
        {status && (
          <span
            className={cn(
              "block truncate text-[11.5px]",
              l.lastError ? "text-negative-foreground" : "text-muted-foreground"
            )}
          >
            {status}
          </span>
        )}
      </span>
      <div className="flex w-full shrink-0 items-center justify-end gap-1 md:w-auto md:gap-0">
        <button
          type="button"
          onClick={() => move(i, -1)}
          disabled={i === 0}
          className="flex h-10 w-10 items-center justify-center rounded-full p-1.5 md:h-7 md:w-7 text-muted-foreground hover:bg-card disabled:opacity-30"
          aria-label={`Monter ${l.label}`}
        >
          <ArrowUp className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => move(i, 1)}
          disabled={i === total - 1}
          className="flex h-10 w-10 items-center justify-center rounded-full p-1.5 md:h-7 md:w-7 text-muted-foreground hover:bg-card disabled:opacity-30"
          aria-label={`Descendre ${l.label}`}
        >
          <ArrowDown className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => edit(l)}
          className="flex h-10 w-10 items-center justify-center rounded-full p-1.5 md:h-7 md:w-7 text-muted-foreground hover:bg-card"
          aria-label={`Modifier ${l.label}`}
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => remove(l)}
          className="flex h-10 w-10 items-center justify-center rounded-full p-1.5 md:h-7 md:w-7 text-muted-foreground hover:bg-negative hover:text-negative-foreground"
          aria-label={`Supprimer ${l.label}`}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </li>
  );
}
