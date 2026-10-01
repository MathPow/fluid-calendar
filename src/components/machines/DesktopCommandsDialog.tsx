"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  AppWindow,
  CalendarClock,
  Clipboard,
  Code2,
  ExternalLink,
  FolderOpen,
  Loader2,
  Lock,
  MessageSquare,
  Star,
  Terminal,
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

import { useT } from "@/i18n/client";
import {
  type DesktopAction,
  agentOnline,
  describeCommand,
} from "@/lib/desktop-actions";
import { type LauncherKind, isPromptKind } from "@/lib/launchers";
import { timeAgoFr } from "@/lib/projets/meta";
import { cn } from "@/lib/utils";

import { ICON_FOR_ACTION } from "../launchers/LauncherIcon";
import { kindLabel, scheduleLabel } from "../launchers/LaunchersDialog";
import {
  reloadLaunchers,
  useLauncherStore,
  useLaunchers,
} from "../launchers/useLaunchers";

type CommandRow = {
  id: string;
  action: string;
  args: Record<string, unknown>;
  status: "queued" | "running" | "done" | "failed" | "denied";
  output: string | null;
  error: string | null;
  createdAt: string;
};

const STATUS_CLS: Record<CommandRow["status"], string> = {
  queued: "text-muted-foreground",
  running: "text-foreground",
  done: "text-[#2e8b62]",
  failed: "text-negative-foreground",
  denied: "text-negative-foreground",
};

type QuickAction = {
  action: DesktopAction;
  labelKey: string;
  icon: typeof Terminal;
  placeholderKey?: string;
  toArgs: (v: string) => Record<string, unknown>;
};

// Quick actions: an input (or none) and the args it becomes.
const QUICK: QuickAction[] = [
  {
    action: "open_url",
    labelKey: "machines.quick.openUrl",
    icon: ExternalLink,
    placeholderKey: "machines.quick.openUrlPlaceholder",
    toArgs: (v) => ({ url: v }),
  },
  {
    action: "open_code",
    labelKey: "machines.quick.vscode",
    icon: Code2,
    placeholderKey: "machines.quick.vscodePlaceholder",
    toArgs: (v) => ({ path: v }),
  },
  {
    action: "open_path",
    labelKey: "machines.quick.openFolder",
    icon: FolderOpen,
    placeholderKey: "machines.quick.openFolderPlaceholder",
    toArgs: (v) => ({ path: v }),
  },
  {
    action: "open_app",
    labelKey: "machines.quick.openApp",
    icon: AppWindow,
    placeholderKey: "machines.quick.openAppPlaceholder",
    toArgs: (v) => ({ app: v }),
  },
  {
    action: "notify",
    labelKey: "machines.quick.notify",
    icon: MessageSquare,
    placeholderKey: "machines.quick.notifyPlaceholder",
    toArgs: (v) => ({ title: "DreamDash", body: v }),
  },
  {
    action: "clipboard",
    labelKey: "machines.quick.clipboard",
    icon: Clipboard,
    placeholderKey: "machines.quick.clipboardPlaceholder",
    toArgs: (v) => ({ text: v }),
  },
  {
    action: "lock",
    labelKey: "machines.quick.lock",
    icon: Lock,
    toArgs: () => ({}),
  },
];

/**
 * Send commands to a machine's desktop agent and watch them run. Shell
 * commands only run after a Yes in a dialog on that desktop.
 */
export function DesktopCommandsDialog({
  machine,
  onClose,
}: {
  machine: { id: string; name: string; label: string | null } | null;
  onClose: () => void;
}) {
  const t = useT();
  const [data, setData] = useState<{
    agent: { connected: boolean; seenAt: string | null };
    commands: CommandRow[];
  } | null>(null);
  const [quick, setQuick] = useState(QUICK[0]);
  const [value, setValue] = useState("");
  const [shell, setShell] = useState("");
  const [sending, setSending] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const { items: launchers } = useLaunchers();

  // Machine actions (scheduled Claude/Codex prompts) still to fire here —
  // one-shots drop out once run, recurring ones stay with their next date.
  const upcoming = useMemo(
    () =>
      machine
        ? launchers
            .filter(
              (l) =>
                l.machine?.id === machine.id &&
                isPromptKind(l.kind) &&
                l.scheduledFor &&
                (!l.lastRunAt || l.lastRunAt < l.scheduledFor)
            )
            .sort((a, b) => a.scheduledFor!.localeCompare(b.scheduledFor!))
        : [],
    [launchers, machine]
  );

  const load = useCallback(async () => {
    if (!machine) return;
    const r = await fetch(`/api/machines/${machine.id}/commands`, {
      cache: "no-store",
    });
    if (r.ok) setData(await r.json());
  }, [machine]);

  useEffect(() => {
    setData(null);
    setToken(null);
    setValue("");
    setShell("");
    if (!machine) return;
    load();
    reloadLaunchers();
    const id = window.setInterval(load, 2000);
    return () => window.clearInterval(id);
  }, [machine, load]);

  const send = async (action: DesktopAction, args: Record<string, unknown>) => {
    if (!machine) return false;
    setSending(true);
    try {
      const r = await fetch(`/api/machines/${machine.id}/commands`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, args }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok)
        throw new Error(body.error || t("common.error", { status: r.status }));
      load();
      return true;
    } catch (e) {
      toast.error(t("machines.command.sendFailed"), {
        description: e instanceof Error ? e.message : undefined,
      });
      return false;
    } finally {
      setSending(false);
    }
  };

  const connect = async () => {
    if (!machine) return;
    if (
      data?.agent.connected &&
      !window.confirm(t("machines.command.replaceTokenConfirm"))
    )
      return;
    const r = await fetch(`/api/machines/${machine.id}/agent`, {
      method: "POST",
    });
    const body = await r.json().catch(() => ({}));
    if (r.ok) setToken(body.token);
    else toast.error(body.error || t("machines.command.impossible"));
    load();
  };

  // ☆ on a history row: the same command becomes an account-menu button.
  const saveAsLauncher = async (c: CommandRow) => {
    if (!machine) return;
    const label = window.prompt(
      t("machines.command.saveShortcutPrompt"),
      describeCommand(c.action, c.args).slice(0, 40)
    );
    if (!label?.trim()) return;
    const r = await fetch("/api/launchers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        label: label.trim().slice(0, 40),
        icon: ICON_FOR_ACTION[c.action] ?? "zap",
        machineId: machine.id,
        action: c.action,
        args: c.args,
      }),
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) {
      toast.error(t("machines.command.saveShortcutFailed"), {
        description: body.error,
      });
      return;
    }
    toast.success(
      t("machines.command.saveShortcutSuccess", { label: label.trim() })
    );
    reloadLaunchers();
  };

  const name = machine ? machine.label || machine.name : "";
  const online = agentOnline(data?.agent.seenAt);

  return (
    <Dialog open={!!machine} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {t("machines.command.title", { name })}
          </DialogTitle>
          <DialogDescription>
            {t("machines.command.description", { name })}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-secondary/60 px-4 py-3">
          <span className="flex items-center gap-2 text-[13px]">
            <span
              className={cn(
                "h-2.5 w-2.5 rounded-full",
                !data
                  ? "bg-muted-foreground/40"
                  : online
                    ? "bg-[#2e8b62]"
                    : "bg-[#e0a33a]"
              )}
            />
            {!data
              ? "…"
              : !data.agent.connected
                ? t("machines.command.agentNone")
                : online
                  ? t("machines.command.agentOnline")
                  : data.agent.seenAt
                    ? t("machines.command.agentOfflineSeen", {
                        ago: timeAgoFr(data.agent.seenAt),
                      })
                    : t("machines.command.agentOffline")}
          </span>
          <Button variant="outline" size="sm" onClick={connect}>
            {data?.agent.connected
              ? t("machines.command.newToken")
              : t("machines.command.connectAgent")}
          </Button>
        </div>

        {token && (
          <div className="space-y-2 rounded-2xl border-2 border-foreground p-4 text-[13px]">
            <p className="font-semibold">
              {t("machines.command.tokenOnceOnly")}
            </p>
            <code className="block break-all rounded-lg bg-secondary px-3 py-2 font-mono text-[12px]">
              {token}
            </code>
            <p className="text-muted-foreground">
              {t("machines.command.tokenHelp.before", { name })}{" "}
              <code>~/.config/dreamdash-agent/token</code>{" "}
              {t("machines.command.tokenHelp.chmod")}{" "}
              <code>systemctl --user restart dreamdash-agent</code>.{" "}
              {t("machines.command.tokenHelp.scriptIn")}{" "}
              <code>scripts/desktop-agent/</code>.
            </p>
          </div>
        )}

        {data?.agent.connected && (
          <>
            <div className="space-y-3">
              <div className="flex flex-wrap gap-1.5">
                {QUICK.map((q) => (
                  <button
                    key={q.action}
                    type="button"
                    onClick={() => {
                      if (!q.placeholderKey) {
                        send(q.action, q.toArgs(""));
                        return;
                      }
                      setQuick(q);
                    }}
                    className={cn(
                      "inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium transition-colors",
                      quick.action === q.action && q.placeholderKey
                        ? "bg-foreground text-background"
                        : "bg-secondary hover:bg-border/70"
                    )}
                  >
                    <q.icon className="h-4 w-4" /> {t(q.labelKey)}
                  </button>
                ))}
              </div>
              <form
                className="flex gap-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!value.trim()) return;
                  if (await send(quick.action, quick.toArgs(value.trim())))
                    setValue("");
                }}
              >
                <Input
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder={
                    quick.placeholderKey ? t(quick.placeholderKey) : undefined
                  }
                  className="font-mono text-[13px]"
                />
                <Button type="submit" disabled={sending || !value.trim()}>
                  {t("machines.command.send")}
                </Button>
              </form>
            </div>

            <form
              className="space-y-2"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!shell.trim()) return;
                if (await send("shell", { command: shell.trim() }))
                  setShell("");
              }}
            >
              <p className="etiquette flex items-center gap-1.5">
                <Terminal className="h-3.5 w-3.5" />{" "}
                {t("machines.command.shellLabel")}
              </p>
              <div className="flex gap-2">
                <Input
                  value={shell}
                  onChange={(e) => setShell(e.target.value)}
                  placeholder={t("machines.command.shellPlaceholder")}
                  className="font-mono text-[13px]"
                  spellCheck={false}
                  autoCapitalize="off"
                  autoCorrect="off"
                />
                <Button
                  type="submit"
                  variant="outline"
                  disabled={sending || !shell.trim()}
                >
                  {t("machines.command.request")}
                </Button>
              </div>
              <p className="text-[12px] text-muted-foreground">
                {t("machines.command.shellHelp", { name })}
              </p>
            </form>
          </>
        )}

        {upcoming.length > 0 && (
          <div>
            <div className="flex items-center justify-between gap-2">
              <p className="etiquette flex items-center gap-1.5">
                <CalendarClock className="h-3.5 w-3.5" />{" "}
                {t("machines.command.upcomingPrompts")}
              </p>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  useLauncherStore.getState().set({ manageOpen: true });
                }}
                className="text-[12px] font-medium text-muted-foreground hover:text-foreground"
              >
                {t("common.manage")}
              </button>
            </div>
            <ul className="mt-2 space-y-1.5">
              {upcoming.map((l) => (
                <li key={l.id} className="rounded-xl bg-secondary/50 px-3 py-2">
                  <div className="flex items-center gap-2 text-[13px]">
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {l.label}
                    </span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {kindLabel(t, l.kind as LauncherKind) ?? l.kind}
                    </span>
                    <span className="shrink-0 text-[12px] font-semibold">
                      {scheduleLabel(t, l.scheduledFor!, l.recurrence)}
                    </span>
                  </div>
                  {l.promptText && (
                    <p className="mt-1 line-clamp-2 text-[12px] text-muted-foreground">
                      {l.promptText}
                    </p>
                  )}
                  {l.lastError && (
                    <p className="mt-1 text-[12px] text-negative-foreground">
                      {t("machines.command.lastRun")} : {l.lastError}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {data && data.commands.length > 0 && (
          <div>
            <p className="etiquette">{t("machines.command.history")}</p>
            <ul className="mt-2 space-y-1.5">
              {data.commands.map((c) => (
                <li key={c.id} className="rounded-xl bg-secondary/50 px-3 py-2">
                  <div className="flex items-center gap-2 text-[13px]">
                    <span className="min-w-0 flex-1 truncate font-mono">
                      {describeCommand(c.action, c.args)}
                    </span>
                    {(c.status === "queued" || c.status === "running") && (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                    )}
                    <span
                      className={cn(
                        "shrink-0 text-[12px] font-semibold",
                        STATUS_CLS[c.status]
                      )}
                    >
                      {t(`machines.command.status.${c.status}`)}
                    </span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {timeAgoFr(c.createdAt)}
                    </span>
                    <button
                      type="button"
                      onClick={() => saveAsLauncher(c)}
                      className="shrink-0 rounded-full p-1 text-muted-foreground hover:bg-card hover:text-foreground"
                      title={t("machines.command.addToShortcuts")}
                      aria-label={t("machines.command.addToShortcuts")}
                    >
                      <Star className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {c.error && (
                    <p className="mt-1 text-[12px] text-negative-foreground">
                      {c.error}
                    </p>
                  )}
                  {c.output && (
                    <pre className="mt-1.5 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-background px-2.5 py-2 font-mono text-[11px]">
                      {c.output}
                    </pre>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
