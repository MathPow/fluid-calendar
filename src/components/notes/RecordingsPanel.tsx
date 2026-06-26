"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  AlertCircle,
  AudioLines,
  FileText,
  Loader2,
  Mic,
  RefreshCw,
  Sparkles,
  Trash2,
  Watch,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

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
  status: string; // "pending" | "processing" | "done" | "error"
  statusError: string | null;
  language: string | null;
  recordedAt: string;
  createdAt: string;
  hasTranscript: boolean;
}

interface RecordingDetail extends RecordingListItem {
  transcript: string | null;
  storagePath: string;
}

const isProcessing = (status: string) =>
  status === "pending" || status === "processing";

/** Compact Markdown styling for LLM-generated summaries (## sections + bullets). */
const summaryMarkdown = {
  h2: (p: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h3 className="mb-1 mt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground first:mt-0" {...p} />
  ),
  h3: (p: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h3 className="mb-1 mt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground first:mt-0" {...p} />
  ),
  p: (p: React.HTMLAttributes<HTMLParagraphElement>) => (
    <p className="mb-2 leading-7" {...p} />
  ),
  ul: (p: React.HTMLAttributes<HTMLUListElement>) => (
    <ul className="mb-2 ml-4 list-disc space-y-0.5" {...p} />
  ),
  ol: (p: React.HTMLAttributes<HTMLOListElement>) => (
    <ol className="mb-2 ml-4 list-decimal space-y-0.5" {...p} />
  ),
  li: (p: React.HTMLAttributes<HTMLLIElement>) => <li className="leading-6" {...p} />,
  strong: (p: React.HTMLAttributes<HTMLElement>) => (
    <strong className="font-semibold text-foreground" {...p} />
  ),
};

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

  const loadList = useCallback(async (opts?: { quiet?: boolean }) => {
    if (!opts?.quiet) setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/recordings");
      if (!res.ok) throw new Error("Failed to load recordings");
      const data = await res.json();
      setItems(data.recordings ?? []);
    } catch {
      setError("Couldn't load recordings.");
    } finally {
      if (!opts?.quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadList();
  }, [loadList]);

  // While anything is transcribing/summarizing, poll quietly so the UI fills in
  // the transcript + summary when canardo finishes — no manual refresh needed.
  const selectedIdRef = useRef<string | null>(null);
  selectedIdRef.current = selectedId;
  const anyProcessing = items.some((r) => isProcessing(r.status));
  useEffect(() => {
    if (!anyProcessing) return;
    const t = setInterval(() => {
      loadList({ quiet: true });
      const open = selectedIdRef.current;
      if (open) {
        fetch(`/api/recordings/${open}`)
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => d?.recording && setDetail(d.recording))
          .catch(() => {});
      }
    }, 5000);
    return () => clearInterval(t);
  }, [anyProcessing, loadList]);

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

  const reprocess = async (id: string, regenerate = false) => {
    try {
      const res = await fetch(
        `/api/recordings/${id}/process${regenerate ? "?regenerate=1" : ""}`,
        { method: "POST" }
      );
      if (!res.ok) throw new Error("Failed to start processing");
      // Optimistically flip to processing; the poll loop takes over from here.
      setItems((prev) =>
        prev.map((r) => (r.id === id ? { ...r, status: "processing" } : r))
      );
      setDetail((d) => (d && d.id === id ? { ...d, status: "processing" } : d));
    } catch {
      alert("Couldn't start processing.");
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
            onClick={() => loadList()}
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
                          {isProcessing(r.status) ? (
                            <span className="inline-flex items-center gap-1 text-primary">
                              <Loader2 className="h-3 w-3 animate-spin" />
                              Processing
                            </span>
                          ) : r.status === "error" ? (
                            <span className="inline-flex items-center gap-1 text-destructive">
                              <AlertCircle className="h-3 w-3" /> Failed
                            </span>
                          ) : (
                            r.hasTranscript && (
                              <FileText
                                className="h-3 w-3"
                                aria-label="Has transcript"
                              />
                            )
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

            {/* Run the pipeline on a recording that was saved without a
                transcript/summary (e.g. ingested before this feature). */}
            {!isProcessing(detail.status) &&
              detail.status !== "error" &&
              (!detail.transcript || !detail.summary) && (
                <button
                  type="button"
                  onClick={() => reprocess(detail.id)}
                  className="mb-6 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  <Sparkles className="h-4 w-4" />
                  {detail.transcript
                    ? "Summarize on canardo"
                    : "Transcribe & summarize on canardo"}
                </button>
              )}

            {isProcessing(detail.status) && (
              <div className="mb-6 flex items-center gap-2 rounded-xl border border-border bg-primary/5 p-4 text-sm text-primary">
                <Loader2 className="h-4 w-4 animate-spin" />
                Transcribing &amp; summarizing on canardo… this can take a few
                minutes.
              </div>
            )}

            {detail.status === "error" && (
              <div className="mb-6 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
                <div className="flex items-center gap-2 text-sm font-medium text-destructive">
                  <AlertCircle className="h-4 w-4" /> Processing failed
                </div>
                {detail.statusError && (
                  <p className="mt-1 text-xs text-destructive/80">
                    {detail.statusError}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => reprocess(detail.id)}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Retry
                </button>
              </div>
            )}

            {detail.summary && (
              <section className="mb-6 rounded-xl border border-border bg-muted/40 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground/80">
                    <Sparkles className="h-4 w-4 text-primary" /> Summary
                  </h2>
                  <button
                    type="button"
                    onClick={() => reprocess(detail.id, true)}
                    disabled={isProcessing(detail.status)}
                    className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
                    title="Regenerate summary"
                  >
                    Regenerate
                  </button>
                </div>
                <div className="text-sm leading-7 text-foreground/90">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={summaryMarkdown}
                  >
                    {detail.summary}
                  </ReactMarkdown>
                </div>
              </section>
            )}

            {detail.transcript ? (
              <section>
                <h2 className="mb-2 text-sm font-semibold text-foreground/80">
                  Transcript
                  {detail.language && (
                    <span className="ml-2 text-xs font-normal uppercase text-muted-foreground">
                      {detail.language}
                    </span>
                  )}
                </h2>
                <p className="whitespace-pre-wrap text-sm leading-7 text-foreground/90">
                  {detail.transcript}
                </p>
              </section>
            ) : (
              !isProcessing(detail.status) && (
                <p className="text-sm text-muted-foreground">
                  No transcript yet for this recording.
                </p>
              )
            )}
          </article>
        )}
      </div>
    </div>
  );
}
