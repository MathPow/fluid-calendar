"use client";

import { useCallback, useEffect, useState } from "react";

import { Loader2, Mic, Plus, RefreshCw } from "lucide-react";

import { SessionEditor, StatusBadge } from "@/components/sessions/SessionEditor";
import { useLocale, useT } from "@/i18n/client";
import { cn } from "@/lib/utils";

interface SessionListItem {
  id: string;
  title: string;
  status: string;
  language: string | null;
  compiledAt: string | null;
  createdAt: string;
  recordingCount: number;
  totalDurationSec: number;
}

function formatDuration(sec: number): string {
  if (!sec) return "";
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return h > 0 ? `${h} h ${String(m).padStart(2, "0")}` : `${m} min`;
}

function formatDate(iso: string, locale: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString(locale === "fr" ? "fr-CA" : "en-CA", {
        month: "short",
        day: "numeric",
      });
}

/**
 * Sessions: record a call, sharpen its transcription with a lexicon, write what
 * you expect an agent to do with it, and point it at files on your machine. The
 * compiled result is pulled by Claude Code over MCP.
 */
export function SessionsWorkspace() {
  const t = useT();
  const locale = useLocale();
  const [items, setItems] = useState<SessionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async (opts?: { quiet?: boolean }) => {
    if (!opts?.quiet) setLoading(true);
    try {
      const res = await fetch("/api/sessions");
      if (!res.ok) throw new Error("load failed");
      const data = await res.json();
      setItems(data.sessions ?? []);
    } catch {
      setItems([]);
    } finally {
      if (!opts?.quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Keep the list's status pills honest while anything is compiling.
  const anyBusy = items.some((s) => s.status === "processing");
  useEffect(() => {
    if (!anyBusy) return;
    const t = setInterval(() => load({ quiet: true }), 10000);
    return () => clearInterval(t);
  }, [anyBusy, load]);

  const create = async () => {
    setCreating(true);
    try {
      const dateLabel = new Date().toLocaleDateString(
        locale === "fr" ? "fr-CA" : "en-CA",
        {
          day: "numeric",
          month: "long",
        }
      );
      const title = t("sessions.workspace.defaultTitle", { date: dateLabel });
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) throw new Error("create failed");
      const data = await res.json();
      await load({ quiet: true });
      setSelectedId(data.session.id);
    } catch {
      alert(t("sessions.workspace.alert.createFailed"));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex h-full">
      {/* List pane */}
      <div className="flex w-72 flex-none flex-col border-r border-border bg-card">
        <div className="flex items-center justify-between gap-2 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">
              {t("sessions.workspace.title")}
            </h2>
            <p className="text-xs text-muted-foreground">
              {t(
                items.length === 1
                  ? "sessions.workspace.countOne"
                  : "sessions.workspace.countOther",
                { count: items.length }
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={() => load()}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            title={t("sessions.workspace.refresh")}
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </button>
        </div>

        <div className="px-3 pb-2">
          <button
            type="button"
            onClick={create}
            disabled={creating}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {creating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            {t("sessions.workspace.newSession")}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-4">
          {loading ? (
            <div className="flex items-center gap-2 px-2 py-3 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
            </div>
          ) : items.length === 0 ? (
            <p className="px-2 py-3 text-sm text-muted-foreground">
              {t("sessions.workspace.empty")}
            </p>
          ) : (
            <ul className="space-y-0.5">
              {items.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(s.id)}
                    className={cn(
                      "flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left text-sm",
                      selectedId === s.id
                        ? "bg-primary/10 text-primary"
                        : "text-foreground/80 hover:bg-accent hover:text-accent-foreground"
                    )}
                  >
                    <Mic className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{s.title}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        <span>{formatDate(s.createdAt, locale)}</span>
                        {s.totalDurationSec > 0 && (
                          <span>· {formatDuration(s.totalDurationSec)}</span>
                        )}
                        <span>·</span>
                        <StatusBadge status={s.status} />
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Editor pane */}
      <div className="min-w-0 flex-1 overflow-y-auto">
        {!selectedId ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-muted-foreground">
            <Mic className="h-10 w-10 opacity-40" />
            <p className="max-w-sm text-sm">
              {t("sessions.workspace.pickHint.before")}
              <strong className="text-foreground"> {t("sessions.workspace.pickHint.strong")} </strong>
              {t("sessions.workspace.pickHint.after")}
            </p>
          </div>
        ) : (
          <SessionEditor
            key={selectedId}
            sessionId={selectedId}
            onChanged={() => load({ quiet: true })}
            onDeleted={() => {
              setSelectedId(null);
              load({ quiet: true });
            }}
          />
        )}
      </div>
    </div>
  );
}
