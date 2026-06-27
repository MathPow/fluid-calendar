"use client";

import { useCallback, useEffect, useState } from "react";

import {
  AlertCircle,
  CalendarClock,
  CheckSquare,
  FileText,
  Loader2,
  RefreshCw,
  RotateCcw,
  Undo2,
  Zap,
} from "lucide-react";

import { cn } from "@/lib/utils";

interface VoiceCommand {
  id: string;
  transcript: string;
  action: string;
  ok: boolean;
  message: string | null;
  targetType: string | null;
  targetId: string | null;
  reverted: boolean;
  revertedAt: string | null;
  createdAt: string;
}

const actionMeta = (action: string, ok: boolean) => {
  if (!ok) return { icon: AlertCircle, label: "failed", tint: "text-destructive" };
  switch (action) {
    case "create_task":
      return { icon: CheckSquare, label: "task", tint: "text-primary" };
    case "create_event":
      return { icon: CalendarClock, label: "event", tint: "text-primary" };
    case "create_note":
      return { icon: FileText, label: "note", tint: "text-primary" };
    default:
      return { icon: Zap, label: "command", tint: "text-muted-foreground" };
  }
};

const timeAgo = (iso: string) => {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
};

export function CommandsPanel() {
  const [commands, setCommands] = useState<VoiceCommand[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revertingId, setRevertingId] = useState<string | null>(null);

  const load = useCallback(async (quiet?: boolean) => {
    if (!quiet) setLoading(true);
    try {
      const res = await fetch("/api/voice/commands");
      if (!res.ok) throw new Error("Failed to load commands");
      const data = await res.json();
      setCommands(data.commands ?? []);
      setError(null);
    } catch {
      setError("Couldn't load commands.");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    // Commands run in the background (~20s), so refresh quietly while open.
    const t = setInterval(() => load(true), 7000);
    return () => clearInterval(t);
  }, [load]);

  const revert = async (id: string) => {
    setRevertingId(id);
    try {
      const res = await fetch(`/api/voice/commands/${id}/revert`, {
        method: "POST",
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.message || "Revert failed");
      }
      setCommands((prev) =>
        prev.map((c) =>
          c.id === id
            ? { ...c, reverted: true, revertedAt: new Date().toISOString() }
            : c
        )
      );
    } catch {
      alert("Couldn't revert that command.");
    } finally {
      setRevertingId(null);
    }
  };

  return (
    <div className="mx-auto h-full max-w-3xl overflow-y-auto px-6 py-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Commands</h2>
          <p className="text-xs text-muted-foreground">
            Everything you dictated, what it did, and an undo.
          </p>
        </div>
        <button
          onClick={() => load()}
          className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
          title="Refresh"
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : error ? (
        <p className="py-10 text-sm text-destructive">{error}</p>
      ) : commands.length === 0 ? (
        <div className="py-10 text-center text-sm text-muted-foreground">
          <Zap className="mx-auto h-8 w-8 opacity-40" />
          <p className="mt-3">No commands yet.</p>
          <p className="mt-1 text-xs">
            Dictate one from the Quick command box or the Shortcut.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {commands.map((c) => {
            const meta = actionMeta(c.action, c.ok);
            const Icon = meta.icon;
            const canRevert = c.ok && c.targetId && !c.reverted;
            return (
              <li
                key={c.id}
                className={cn(
                  "rounded-xl border border-border bg-card p-3",
                  c.reverted && "opacity-60"
                )}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={cn(
                      "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted",
                      meta.tint
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      {c.message || meta.label}
                    </p>
                    <p className="mt-0.5 truncate text-xs italic text-muted-foreground">
                      “{c.transcript}”
                    </p>
                    <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="capitalize">{meta.label}</span>
                      <span>·</span>
                      <span>{timeAgo(c.createdAt)}</span>
                      {c.reverted && (
                        <>
                          <span>·</span>
                          <span className="inline-flex items-center gap-1 text-foreground/70">
                            <Undo2 className="h-3 w-3" /> reverted
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  {canRevert && (
                    <button
                      onClick={() => revert(c.id)}
                      disabled={revertingId === c.id}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                      title="Undo this command"
                    >
                      {revertingId === c.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RotateCcw className="h-3.5 w-3.5" />
                      )}
                      Revert
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
