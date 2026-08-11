"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  AlertCircle,
  Check,
  Copy,
  FileCode2,
  FileText,
  Loader2,
  Play,
  Plus,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { TranscriptSearch } from "@/components/sessions/TranscriptSearch";
import { cn } from "@/lib/utils";

interface Target {
  path: string;
  kind: "repo" | "doc";
  note?: string;
}

interface SessionRecording {
  id: string;
  title: string;
  fileName: string;
  sizeBytes: number;
  durationSec: number | null;
  status: string;
  statusError: string | null;
  orderIndex: number;
  segmentCount: number;
  offsetSec: number;
}

interface SessionDetail {
  id: string;
  title: string;
  lexicon: string | null;
  language: string | null;
  model: string | null;
  brief: string | null;
  targets: Target[];
  digest: string | null;
  toc: string | null;
  status: string;
  statusError: string | null;
  compiledAt: string | null;
  totalDurationSec: number;
  recordings: SessionRecording[];
}

const isBusy = (status: string) => status === "processing";

function formatDuration(sec: number | null): string {
  if (!sec || sec <= 0) return "—";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

function formatSize(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Section wrapper with a step number, so the required order is visible at a glance. */
function Step({
  n,
  title,
  hint,
  children,
}: {
  n: number;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="mb-1 flex items-center gap-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
          {n}
        </span>
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      {hint && <p className="mb-3 ml-7 text-xs text-muted-foreground">{hint}</p>}
      <div className="ml-7">{children}</div>
    </section>
  );
}

export function SessionEditor({
  sessionId,
  onChanged,
  onDeleted,
}: {
  sessionId: string;
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [copied, setCopied] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // Local drafts so typing isn't fighting the poll loop.
  const [title, setTitle] = useState("");
  const [lexicon, setLexicon] = useState("");
  const [brief, setBrief] = useState("");
  const [targets, setTargets] = useState<Target[]>([]);
  const [language, setLanguage] = useState("");

  const load = useCallback(
    async (opts?: { quiet?: boolean }) => {
      if (!opts?.quiet) setLoading(true);
      try {
        const res = await fetch(`/api/sessions/${sessionId}`);
        if (!res.ok) throw new Error("load failed");
        const data = await res.json();
        const s: SessionDetail = data.session;
        setSession(s);
        if (!opts?.quiet) {
          setTitle(s.title);
          setLexicon(s.lexicon ?? "");
          setBrief(s.brief ?? "");
          setTargets(s.targets ?? []);
          setLanguage(s.language ?? "");
        }
      } catch {
        setSession(null);
      } finally {
        if (!opts?.quiet) setLoading(false);
      }
    },
    [sessionId]
  );

  useEffect(() => {
    load();
  }, [load]);

  // While compiling, poll so the digest appears when canardo finishes.
  const busy = session ? isBusy(session.status) : false;
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => load({ quiet: true }), 5000);
    return () => clearInterval(t);
  }, [busy, load]);

  const save = useCallback(
    async (patch: Record<string, unknown>) => {
      setSaving(true);
      try {
        const res = await fetch(`/api/sessions/${sessionId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(patch),
        });
        if (!res.ok) throw new Error("save failed");
        onChanged();
      } catch {
        // Non-fatal: the field keeps its local value and the next blur retries.
      } finally {
        setSaving(false);
      }
    },
    [sessionId, onChanged]
  );

  const upload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const form = new FormData();
      for (const file of Array.from(files)) form.append("file", file);
      const res = await fetch(`/api/sessions/${sessionId}/audio`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) throw new Error("upload failed");
      await load({ quiet: true });
      onChanged();
    } catch {
      alert("Le téléversement a échoué.");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const compile = async (force: boolean) => {
    const res = await fetch(
      `/api/sessions/${sessionId}/compile${force ? "?force=1" : ""}`,
      { method: "POST" }
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error ?? "Impossible de lancer la compilation.");
      return;
    }
    setSession((s) => (s ? { ...s, status: "processing", statusError: null } : s));
    onChanged();
  };

  const removeRecording = async (id: string) => {
    if (!confirm("Retirer cet audio de la session ?")) return;
    await fetch(`/api/recordings/${id}`, { method: "DELETE" });
    await load({ quiet: true });
    onChanged();
  };

  const removeSession = async () => {
    if (!confirm("Supprimer cette session, ses audios et sa transcription ?")) return;
    await fetch(`/api/sessions/${sessionId}`, { method: "DELETE" });
    onDeleted();
  };

  const copyMission = async () => {
    const res = await fetch(`/api/sessions/${sessionId}/mission`);
    const text = await res.text();
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
      </div>
    );
  }
  if (!session) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-destructive">
        Session introuvable.
      </div>
    );
  }

  const hasAudio = session.recordings.length > 0;
  const transcribed = session.recordings.some((r) => r.segmentCount > 0);

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-6 py-6">
      {/* Title + delete */}
      <div className="flex items-start justify-between gap-4">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title.trim() && title !== session.title && save({ title })}
          className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1 text-2xl font-bold tracking-tight outline-none hover:border-border focus:border-primary"
        />
        <div className="flex items-center gap-2 pt-2">
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          <button
            type="button"
            onClick={removeSession}
            className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            title="Supprimer la session"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* --- Step 1: lexicon, BEFORE transcription --- */}
      <Step
        n={1}
        title="Lexique"
        hint="À remplir avant de transcrire : ces mots sont injectés dans le décodeur de Whisper, pas corrigés après coup. Noms d'entreprises, de projets, des deux personnes qui parlent. Un par ligne, avec un contexte optionnel après un « = »."
      >
        <textarea
          value={lexicon}
          onChange={(e) => setLexicon(e.target.value)}
          onBlur={() => lexicon !== (session.lexicon ?? "") && save({ lexicon })}
          rows={7}
          spellCheck={false}
          placeholder={"Mathys\nStayChum = notre app de colocation\nUguiso Technologies\nplan d'affaires"}
          className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm outline-none focus:border-primary"
        />
        <div className="mt-2 flex items-center gap-3">
          <label className="text-xs text-muted-foreground">Langue</label>
          <select
            value={language}
            onChange={(e) => {
              setLanguage(e.target.value);
              save({ language: e.target.value || null });
            }}
            className="rounded-lg border border-border bg-background px-2 py-1 text-sm outline-none focus:border-primary"
          >
            <option value="">Détection auto</option>
            <option value="fr">Français</option>
            <option value="en">Anglais</option>
          </select>
          <span className="text-xs text-muted-foreground">
            Forcer la langue évite que Whisper dérive en anglais sur un appel bilingue.
          </span>
        </div>
      </Step>

      {/* --- Step 2: audio --- */}
      <Step
        n={2}
        title="Audios de l'appel"
        hint="Plusieurs fichiers sont bouts à bout dans l'ordre d'ajout : les timestamps du digest suivent cette ligne de temps continue."
      >
        <input
          ref={fileInput}
          type="file"
          accept="audio/*"
          multiple
          onChange={(e) => upload(e.target.files)}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          disabled={uploading}
          className="inline-flex items-center gap-2 rounded-lg border border-dashed border-border px-4 py-2 text-sm hover:border-primary hover:text-primary disabled:opacity-50"
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Upload className="h-4 w-4" />
          )}
          {uploading ? "Téléversement…" : "Ajouter des fichiers audio"}
        </button>

        {hasAudio && (
          <ul className="mt-3 space-y-1.5">
            {session.recordings.map((r) => (
              <li
                key={r.id}
                className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm"
              >
                <span className="font-mono text-xs text-muted-foreground">
                  {formatDuration(r.offsetSec)}
                </span>
                <span className="min-w-0 flex-1 truncate">{r.title}</span>
                <span className="text-xs text-muted-foreground">
                  {formatDuration(r.durationSec)} · {formatSize(r.sizeBytes)}
                </span>
                {r.status === "error" ? (
                  <AlertCircle className="h-4 w-4 text-destructive" />
                ) : r.segmentCount > 0 ? (
                  <span
                    className="text-xs text-primary"
                    title={`${r.segmentCount} segments indexés`}
                  >
                    indexé
                  </span>
                ) : null}
                <a
                  href={`/api/recordings/${r.id}/audio`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded p-1 text-muted-foreground hover:text-foreground"
                  title="Écouter"
                >
                  <Play className="h-3.5 w-3.5" />
                </a>
                <button
                  type="button"
                  onClick={() => removeRecording(r.id)}
                  className="rounded p-1 text-muted-foreground hover:text-destructive"
                  title="Retirer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Step>

      {/* --- Step 3: the brief --- */}
      <Step
        n={3}
        title="Ton brief"
        hint="Ce que tu attends de Claude avec cet appel. Ça oriente autant le digest (ce qui compte est retenu) que le travail ensuite."
      >
        <textarea
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          onBlur={() => brief !== (session.brief ?? "") && save({ brief })}
          rows={6}
          placeholder="Ex. : On a revu le pricing et la section 4 du plan d'affaires. Applique les changements de pricing sur le site, et réécris §4 avec les nouvelles projections. Demande-moi avant de toucher au wording de la page d'accueil."
          className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm leading-6 outline-none focus:border-primary"
        />
      </Step>

      {/* --- Step 4: targets --- */}
      <Step
        n={4}
        title="Cibles sur ta machine"
        hint="Chemins absolus. DreamDash n'y touche jamais — il les transmet à Claude Code, qui tourne chez toi et a l'accès disque."
      >
        <ul className="space-y-2">
          {targets.map((t, i) => (
            <li key={i} className="flex items-center gap-2">
              <select
                value={t.kind}
                onChange={(e) => {
                  const next = [...targets];
                  next[i] = { ...t, kind: e.target.value as "repo" | "doc" };
                  setTargets(next);
                  save({ targets: next });
                }}
                className="rounded-lg border border-border bg-background px-2 py-2 text-xs outline-none focus:border-primary"
              >
                <option value="repo">repo</option>
                <option value="doc">doc</option>
              </select>
              <input
                value={t.path}
                onChange={(e) => {
                  const next = [...targets];
                  next[i] = { ...t, path: e.target.value };
                  setTargets(next);
                }}
                onBlur={() => save({ targets: targets.filter((x) => x.path.trim()) })}
                placeholder="/home/mathys/repos/StayChum"
                className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs outline-none focus:border-primary"
              />
              <input
                value={t.note ?? ""}
                onChange={(e) => {
                  const next = [...targets];
                  next[i] = { ...t, note: e.target.value };
                  setTargets(next);
                }}
                onBlur={() => save({ targets: targets.filter((x) => x.path.trim()) })}
                placeholder="quoi faire ici"
                className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-xs outline-none focus:border-primary"
              />
              <button
                type="button"
                onClick={() => {
                  const next = targets.filter((_, j) => j !== i);
                  setTargets(next);
                  save({ targets: next });
                }}
                className="rounded p-1.5 text-muted-foreground hover:text-destructive"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => setTargets([...targets, { path: "", kind: "repo" }])}
          className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" /> Ajouter une cible
        </button>
      </Step>

      {/* --- Compile --- */}
      <section className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => compile(false)}
            disabled={!hasAudio || busy}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {busy ? "Compilation en cours…" : "Transcrire et compiler"}
          </button>

          {transcribed && !busy && (
            <button
              type="button"
              onClick={() => compile(true)}
              className="rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground hover:text-foreground"
              title="Retranscrire depuis zéro — nécessaire après avoir modifié le lexique"
            >
              Retranscrire avec le lexique à jour
            </button>
          )}

          {session.status === "ready" && (
            <button
              type="button"
              onClick={copyMission}
              className="ml-auto inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:border-primary hover:text-primary"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copié" : "Copier la mission"}
            </button>
          )}
        </div>

        {busy && (
          <p className="mt-3 text-xs text-muted-foreground">
            Whisper transcrit sur canardo, puis le digest se construit par tranches de
            10 minutes. Sur plusieurs heures d&apos;audio, compte un bon moment — tu peux
            fermer la page.
          </p>
        )}

        {session.status === "error" && session.statusError && (
          <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
            <div className="flex items-center gap-2 text-sm font-medium text-destructive">
              <AlertCircle className="h-4 w-4" /> La compilation a échoué
            </div>
            <p className="mt-1 text-xs text-destructive/80">{session.statusError}</p>
          </div>
        )}

        {session.status === "ready" && (
          <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
            <FileCode2 className="h-3.5 w-3.5" />
            Claude peut aussi la tirer lui-même :{" "}
            <code className="rounded bg-muted px-1 py-0.5">
              get_mission({session.id})
            </code>
          </p>
        )}
      </section>

      {/* --- Results --- */}
      {session.digest && (
        <section className="rounded-xl border border-border bg-card p-4">
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
            <Sparkles className="h-4 w-4 text-primary" /> Digest
          </h3>
          <div className="prose-sm text-sm leading-7 text-foreground/90">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{session.digest}</ReactMarkdown>
          </div>
        </section>
      )}

      {session.toc && (
        <details className="rounded-xl border border-border bg-card p-4">
          <summary className="cursor-pointer text-sm font-semibold">
            <FileText className="mr-1.5 inline h-4 w-4 text-primary" />
            Table des matières ({session.toc.split("\n").filter((l) => l.startsWith("-")).length}{" "}
            tranches)
          </summary>
          <div className="mt-3 text-sm leading-6 text-foreground/90">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{session.toc}</ReactMarkdown>
          </div>
        </details>
      )}

      {transcribed && <TranscriptSearch sessionId={session.id} />}
    </div>
  );
}

/** Shared status pill, also used by the list pane. */
export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    draft: { label: "brouillon", className: "text-muted-foreground" },
    processing: { label: "compilation", className: "text-primary" },
    ready: { label: "prête", className: "text-emerald-600 dark:text-emerald-400" },
    error: { label: "erreur", className: "text-destructive" },
  };
  const s = map[status] ?? map.draft;
  return <span className={cn("text-xs", s.className)}>{s.label}</span>;
}
