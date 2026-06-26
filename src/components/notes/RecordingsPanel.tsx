"use client";

import { useEffect, useState } from "react";

import {
  AudioLines,
  FileText,
  Loader2,
  Mic,
  RefreshCw,
  Trash2,
  Watch,
} from "lucide-react";

import { cn } from "@/lib/utils";

interface RecordingListItem {
  id: string;
  title: string;
  source: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  durationSec: number | null;
  summary: string | null;
  recordedAt: string;
  createdAt: string;
  hasTranscript: boolean;
}

interface RecordingDetail extends RecordingListItem {
  transcript: string | null;
  storagePath: string;
}

const sourceIcon = (source: string) => {
  if (source === "watch") return Watch;
  if (source === "meetily") return Mic;
  return AudioLines;
};

const formatDuration = (sec: number | null) => {
  if (!sec || sec <= 0) return null;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
};

const formatSize = (bytes: number) => {
  if (!bytes) return null;
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
};

const formatDate = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export function RecordingsPanel() {
  const [items, setItems] = useState<RecordingListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<RecordingDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadList = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/recordings");
      if (!res.ok) throw new Error("Failed to load recordings");
      const data = await res.json();
      setItems(data.recordings ?? []);
    } catch {
      setError("Couldn't load recordings.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadList();
  }, []);

  const select = async (id: string) => {
    setSelectedId(id);
    setDetail(null);
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/recordings/${id}`);
      if (!res.ok) throw new Error("Failed to load recording");
      const data = await res.json();
      setDetail(data.recording);
    } catch {
      setDetail(null);
    } finally {
      setLoadingDetail(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this recording? This also removes the audio file.")) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/recordings/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      setItems((prev) => prev.filter((r) => r.id !== id));
      if (selectedId === id) {
        setSelectedId(null);
        setDetail(null);
      }
    } catch {
      alert("Couldn't delete that recording.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="flex h-full">
      {/* List pane */}
      <div className="flex w-72 flex-none flex-col border-r border-border bg-card">
        <div className="flex items-center justify-between gap-2 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">Recordings</h2>
            <p className="text-xs text-muted-foreground">
              {items.length} {items.length === 1 ? "recording" : "recordings"}
            </p>
          </div>
          <button
            type="button"
            onClick={loadList}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Refresh"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-4">
          {loading ? (
            <div className="flex items-center gap-2 px-2 py-3 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : error ? (
            <p className="px-2 py-3 text-sm text-destructive">{error}</p>
          ) : items.length === 0 ? (
            <div className="px-2 py-3 text-sm text-muted-foreground">
              <p>No recordings yet.</p>
              <p className="mt-2 text-xs">
                Sync from Meetily or your Apple Watch and they show up here.
              </p>
            </div>
          ) : (
            <ul className="space-y-0.5">
              {items.map((r) => {
                const Icon = sourceIcon(r.source);
                const dur = formatDuration(r.durationSec);
                return (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => select(r.id)}
                      className={cn(
                        "flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left text-sm",
                        selectedId === r.id
                          ? "bg-primary/10 text-primary"
                          : "text-foreground/80 hover:bg-accent hover:text-accent-foreground"
                      )}
                    >
                      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">
                          {r.title}
                        </span>
                        <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span>{formatDate(r.recordedAt)}</span>
                          {dur && <span>· {dur}</span>}
                          {r.hasTranscript && (
                            <FileText className="h-3 w-3" aria-label="Has transcript" />
                          )}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Viewer pane */}
      <div className="min-w-0 flex-1 overflow-y-auto">
        {!selectedId ? (
          <div className="flex h-full flex-col items-center justify-center p-6 text-center text-muted-foreground">
            <AudioLines className="h-10 w-10 opacity-40" />
            <p className="mt-3 text-sm">Select a recording to play it.</p>
          </div>
        ) : loadingDetail ? (
          <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading recording…
          </div>
        ) : !detail ? (
          <div className="flex h-full items-center justify-center text-sm text-destructive">
            Failed to load this recording.
          </div>
        ) : (
          <article className="mx-auto max-w-3xl px-8 py-8">
            <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
              <span className="capitalize">{detail.source}</span>
              <span>·</span>
              <span>{formatDate(detail.recordedAt)}</span>
              {formatSize(detail.sizeBytes) && (
                <>
                  <span>·</span>
                  <span>{formatSize(detail.sizeBytes)}</span>
                </>
              )}
            </div>
            <div className="mb-4 flex items-start justify-between gap-4">
              <h1 className="text-2xl font-bold tracking-tight">{detail.title}</h1>
              <button
                type="button"
                onClick={() => remove(detail.id)}
                disabled={deletingId === detail.id}
                className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                title="Delete recording"
              >
                {deletingId === detail.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </button>
            </div>

            <audio
              controls
              preload="metadata"
              className="mb-6 w-full"
              src={`/api/recordings/${detail.id}/audio`}
            />

            {detail.summary && (
              <section className="mb-6 rounded-xl border border-border bg-muted/40 p-4">
                <h2 className="mb-2 text-sm font-semibold text-foreground/80">
                  Summary
                </h2>
                <p className="whitespace-pre-wrap text-sm leading-7 text-foreground/90">
                  {detail.summary}
                </p>
              </section>
            )}

            {detail.transcript ? (
              <section>
                <h2 className="mb-2 text-sm font-semibold text-foreground/80">
                  Transcript
                </h2>
                <p className="whitespace-pre-wrap text-sm leading-7 text-foreground/90">
                  {detail.transcript}
                </p>
              </section>
            ) : (
              <p className="text-sm text-muted-foreground">
                No transcript was sent with this recording.
              </p>
            )}
          </article>
        )}
      </div>
    </div>
  );
}
