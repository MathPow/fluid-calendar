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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

import { type TranslateFn, useT } from "@/i18n/client";
import {
  DESKTOP_ACTIONS,
  USER_DESKTOP_ACTION_IDS,
  type DesktopAction,
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
  { key: string; labelKey: string; placeholderKey: string; mono?: boolean }[]
> = {
  open_url: [
    {
      key: "url",
      labelKey: "launchers.fields.url.label",
      placeholderKey: "launchers.fields.url.placeholder",
      mono: true,
    },
  ],
  open_path: [
    {
      key: "path",
      labelKey: "launchers.fields.openPath.label",
      placeholderKey: "launchers.fields.openPath.placeholder",
      mono: true,
    },
  ],
  open_code: [
    {
      key: "path",
      labelKey: "launchers.fields.openCode.label",
      placeholderKey: "launchers.fields.openCode.placeholder",
      mono: true,
    },
  ],
  open_app: [
    {
      key: "app",
      labelKey: "launchers.fields.openApp.label",
      placeholderKey: "launchers.fields.openApp.placeholder",
      mono: true,
    },
  ],
  notify: [
    {
      key: "title",
      labelKey: "launchers.fields.notifyTitle.label",
      placeholderKey: "launchers.fields.notifyTitle.placeholder",
    },
    {
      key: "body",
      labelKey: "launchers.fields.notifyBody.label",
      placeholderKey: "launchers.fields.notifyBody.placeholder",
    },
  ],
  clipboard: [
    {
      key: "text",
      labelKey: "launchers.fields.clipboard.label",
      placeholderKey: "launchers.fields.clipboard.placeholder",
    },
  ],
  lock: [],
  shell: [
    {
      key: "command",
      labelKey: "launchers.fields.shell.label",
      placeholderKey: "launchers.fields.shell.placeholder",
      mono: true,
    },
    {
      key: "cwd",
      labelKey: "launchers.fields.cwd.label",
      placeholderKey: "launchers.fields.cwd.placeholder",
      mono: true,
    },
  ],
  agent_run: [],
};

export function kindLabel(t: TranslateFn, kind: LauncherKind): string {
  return t(`launchers.kind.${kind}`);
}

function recurrenceLabel(
  t: TranslateFn,
  r: LauncherRecurrence | "none"
): string {
  return t(`launchers.recurrence.${r}`);
}

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
    icon: kind === "shell" ? "code" : kind === "claude-prompt" ? "zap" : "terminal",
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

export function scheduleLabel(
  t: TranslateFn,
  scheduledFor: string,
  recurrence: string | null
) {
  const d = new Date(scheduledFor);
  const when = d.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const suffix =
    recurrence && recurrence !== "none"
      ? ` · ${recurrenceLabel(t, recurrence as LauncherRecurrence)}`
      : "";
  return `${when}${suffix}`;
}

function runStatus(t: TranslateFn, l: LauncherRow): string | null {
  if (l.lastError)
    return t("launchers.run.error", { error: l.lastError });
  if (l.lastResult) {
    const tail = l.lastResult.trim().split("\n").slice(-1)[0] || "";
    return t("launchers.run.lastRun", { text: tail.slice(0, 80) });
  }
  if (l.scheduledFor) return t("launchers.run.waiting");
  return null;
}

/** Account menu ▸ « Gérer les raccourcis »: create, edit, order, delete. */
export function LaunchersDialog() {
  const t = useT();
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
      if (!r.ok)
        throw new Error(
          respBody.error || t("common.error", { status: r.status })
        );
      setForm(null);
      reloadLaunchers();
    } catch (e) {
      toast.error(t("launchers.saveFailed"), {
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
    if (
      !window.confirm(
        t("launchers.deleteConfirm", { label: l.label })
      )
    )
      return;
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
      recurrence:
        (l.recurrence as LauncherRecurrence | null) ?? "none",
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
          <DialogTitle>{t("launchers.title")}</DialogTitle>
          <DialogDescription>
            {t("launchers.description")}
          </DialogDescription>
        </DialogHeader>

        {!form ? (
          <>
            <Tabs defaultValue="instant" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="instant" className="gap-1.5">
                  <Zap className="h-3.5 w-3.5" /> {t("launchers.tabs.instant")}
                </TabsTrigger>
                <TabsTrigger value="scheduled" className="gap-1.5">
                  <CalendarClock className="h-3.5 w-3.5" />{" "}
                  {t("launchers.tabs.scheduled")}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="instant" className="mt-3 space-y-1.5">
                {instant.length === 0 ? (
                  <p className="rounded-2xl bg-secondary/60 px-4 py-6 text-center text-[13px] text-muted-foreground">
                    {t("launchers.emptyInstant")}
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
                    {t("launchers.emptyScheduled")}
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
                <Plus /> {kindLabel(t, "shell")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => startCreate("claude-prompt")}
                disabled={promptMachines.length === 0}
              >
                <Plus /> {kindLabel(t, "claude-prompt")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => startCreate("codex-prompt")}
                disabled={promptMachines.length === 0}
              >
                <Plus /> {kindLabel(t, "codex-prompt")}
              </Button>
            </div>
            {promptMachines.length === 0 && machines.length > 0 && (
              <p className="text-[12px] text-muted-foreground">
                {t("launchers.noUsableMachine")}
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
              {kindLabel(t, form.kind)}
            </div>
            <div className="space-y-2">
              <Label htmlFor="launcher-label">
                {t("launchers.form.labelLabel")}
              </Label>
              <Input
                id="launcher-label"
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                placeholder={
                  form.kind === "shell"
                    ? t("launchers.form.labelPlaceholder.shell")
                    : t("launchers.form.labelPlaceholder.prompt")
                }
                maxLength={40}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("launchers.form.iconLabel")}</Label>
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
              <Label>{t("launchers.form.machineLabel")}</Label>
              <Select
                value={form.machineId}
                onValueChange={(v) => setForm({ ...form, machineId: v })}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={t("launchers.form.machinePlaceholder")}
                  />
                </SelectTrigger>
                <SelectContent>
                  {(form.kind === "shell"
                    ? shellMachines
                    : promptMachines
                  ).map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.label || m.name}
                      {!agentOnline(m.agentSeenAt) && (
                        <span className="text-muted-foreground">
                          {" "}
                          ·{" "}
                          {m.host && m.sshUser
                            ? t("launchers.form.viaSsh")
                            : t("launchers.form.offline")}
                        </span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {form.kind === "shell" ? (
              <>
                <div className="space-y-2">
                  <Label>{t("launchers.form.actionLabel")}</Label>
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
                          {t(`launchers.actions.${a}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {FIELDS[form.action].map((f) => (
                  <div key={f.key} className="space-y-2">
                    <Label htmlFor={`launcher-${f.key}`}>
                      {t(f.labelKey)}
                    </Label>
                    <Input
                      id={`launcher-${f.key}`}
                      value={form.args[f.key] ?? ""}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          args: { ...form.args, [f.key]: e.target.value },
                        })
                      }
                      placeholder={t(f.placeholderKey)}
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
                    {t(
                      form.kind === "claude-prompt"
                        ? "launchers.form.promptLabel.claude"
                        : "launchers.form.promptLabel.codex"
                    )}
                  </Label>
                  <Textarea
                    id="launcher-prompt"
                    value={form.promptText}
                    onChange={(e) =>
                      setForm({ ...form, promptText: e.target.value })
                    }
                    placeholder={t(
                      form.kind === "claude-prompt"
                        ? "launchers.form.promptPlaceholder.claude"
                        : "launchers.form.promptPlaceholder.codex"
                    )}
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
                        {t("launchers.form.schedule")}
                      </Label>
                      <p className="text-[11.5px] text-muted-foreground">
                        {t("launchers.form.scheduleHint")}
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
                          {t("launchers.form.date")}
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
                          {t("launchers.form.time")}
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
                        <Label className="text-[11.5px]">
                          {t("launchers.form.recurrence")}
                        </Label>
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
                              {recurrenceLabel(t, "none")}
                            </SelectItem>
                            {LAUNCHER_RECURRENCES.map((r) => (
                              <SelectItem key={r} value={r}>
                                {recurrenceLabel(t, r)}
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
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={busy || !canSubmit}>
                {form.id ? t("common.save") : t("common.create")}
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
  const t = useT();
  const status = runStatus(t, l);
  const machineLabel = l.machine
    ? l.machine.label || l.machine.name
    : t("launchers.noMachine");
  const summary =
    l.kind === "shell"
      ? describeCommand(l.action, l.args)
      : l.kind === "claude-prompt"
        ? `Claude · ${(l.promptText || "").slice(0, 60)}`
        : `Codex · ${(l.promptText || "").slice(0, 60)}`;
  return (
    <li className="flex items-center gap-2.5 rounded-2xl bg-secondary/60 py-2 pl-3 pr-1.5">
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
            {scheduleLabel(t, l.scheduledFor, l.recurrence)}
          </span>
        )}
        {status && (
          <span
            className={cn(
              "block truncate text-[11.5px]",
              l.lastError ? "text-negative" : "text-muted-foreground"
            )}
          >
            {status}
          </span>
        )}
      </span>
      <button
        type="button"
        onClick={() => move(i, -1)}
        disabled={i === 0}
        className="rounded-full p-1.5 text-muted-foreground hover:bg-card disabled:opacity-30"
        aria-label={t("launchers.moveUp", { label: l.label })}
      >
        <ArrowUp className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => move(i, 1)}
        disabled={i === total - 1}
        className="rounded-full p-1.5 text-muted-foreground hover:bg-card disabled:opacity-30"
        aria-label={t("launchers.moveDown", { label: l.label })}
      >
        <ArrowDown className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => edit(l)}
        className="rounded-full p-1.5 text-muted-foreground hover:bg-card"
        aria-label={t("launchers.editAria", { label: l.label })}
      >
        <Pencil className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => remove(l)}
        className="rounded-full p-1.5 text-muted-foreground hover:bg-negative hover:text-negative-foreground"
        aria-label={t("launchers.deleteAria", { label: l.label })}
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </li>
  );
}
