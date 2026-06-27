"use client";

import { useRef, useState } from "react";

import { Loader2, Save, Send, Zap } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";

const AUDIO_EXT = /\.(m4a|mp3|wav|ogg|webm|aac|caf|flac)$/i;
const isAudio = (f: File) =>
  f.type.startsWith("audio/") || AUDIO_EXT.test(f.name);

/**
 * Two drop targets shown in the empty Notes/Recordings pane:
 *  - "Save"    keeps the dropped item — audio → Recordings, text → vault note.
 *  - "Command" runs the dropped audio/text as a voice command (task/event/note),
 *              then discards it.
 * Both accept drag-drop and click-to-browse; the command zone also takes typed text.
 */
export function DropZones({ onSaved }: { onSaved?: () => void }) {
  return (
    <div className="grid w-full max-w-2xl gap-4 sm:grid-cols-2">
      <SaveZone onSaved={onSaved} />
      <CommandZone />
    </div>
  );
}

async function uploadRecording(file: File): Promise<void> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("title", file.name.replace(/\.[^.]+$/, ""));
  fd.append("source", "upload");
  const res = await fetch("/api/recordings", { method: "POST", body: fd });
  if (!res.ok) throw new Error("recording upload failed");
}

async function saveNoteFile(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("name", file.name);
  const res = await fetch("/api/notes/save", { method: "POST", body: fd });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error || "note save failed");
  }
  const data = await res.json();
  return data.path as string;
}

function SaveZone({ onSaved }: { onSaved?: () => void }) {
  const [busy, setBusy] = useState(false);

  const handle = async (files: File[]) => {
    if (files.length === 0) return;
    setBusy(true);
    try {
      for (const f of files) {
        if (isAudio(f)) {
          await uploadRecording(f);
          toast.success(`Saved to Recordings: ${f.name}`);
        } else {
          const path = await saveNoteFile(f);
          toast.success(`Saved note: ${path.replace(/^\//, "")}`);
        }
      }
      onSaved?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save that.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dropper
      title="Save to DreamDash"
      subtitle="Audio → Recordings · Notes → vault"
      icon={<Save className="h-5 w-5" />}
      accept="audio/*,.md,.txt,.markdown"
      busy={busy}
      onFiles={handle}
      accent
    />
  );
}

function CommandZone() {
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");

  const sendText = async (value: string) => {
    const fd = new FormData();
    fd.append("text", value);
    const res = await fetch("/api/voice", { method: "POST", body: fd });
    if (!res.ok) throw new Error("command failed");
  };

  const sendAudio = async (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/voice", { method: "POST", body: fd });
    if (!res.ok) throw new Error("command failed");
  };

  const handleFiles = async (files: File[]) => {
    if (files.length === 0) return;
    setBusy(true);
    try {
      for (const f of files) {
        if (isAudio(f)) await sendAudio(f);
        else await sendText(await f.text());
      }
      toast.success("Command sent — it'll run in a moment.");
    } catch {
      toast.error("Couldn't send that command.");
    } finally {
      setBusy(false);
    }
  };

  const submitText = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    try {
      await sendText(text.trim());
      toast.success("Command sent — it'll run in a moment.");
      setText("");
    } catch {
      toast.error("Couldn't send that command.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dropper
      title="Quick command"
      subtitle="Audio or text → runs an action, then discarded"
      icon={<Zap className="h-5 w-5" />}
      accept="audio/*,.md,.txt"
      busy={busy}
      onFiles={handleFiles}
    >
      <form onSubmit={submitText} className="mt-2 flex items-center gap-1.5">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="…or type a command"
          className="min-w-0 flex-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs outline-none focus:border-primary"
        />
        <button
          type="submit"
          disabled={busy || !text.trim()}
          className="rounded-lg bg-primary p-1.5 text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          title="Send command"
        >
          <Send className="h-3.5 w-3.5" />
        </button>
      </form>
    </Dropper>
  );
}

function Dropper({
  title,
  subtitle,
  icon,
  accept,
  busy,
  onFiles,
  accent,
  children,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  accept: string;
  busy: boolean;
  onFiles: (files: File[]) => void;
  accent?: boolean;
  children?: React.ReactNode;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        onFiles(Array.from(e.dataTransfer.files));
      }}
      className={cn(
        "flex flex-col rounded-xl border-2 border-dashed p-4 text-left transition-colors",
        over
          ? "border-primary bg-primary/5"
          : accent
            ? "border-primary/30 hover:border-primary/50"
            : "border-border hover:border-foreground/30"
      )}
    >
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="flex items-start gap-3 text-left"
      >
        <span
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
            accent
              ? "bg-primary/10 text-primary"
              : "bg-muted text-muted-foreground"
          )}
        >
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : icon}
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold">{title}</span>
          <span className="block text-xs text-muted-foreground">{subtitle}</span>
          <span className="mt-1 block text-xs text-muted-foreground/70">
            Drop a file or click to browse
          </span>
        </span>
      </button>
      {children}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple
        className="hidden"
        onChange={(e) => {
          onFiles(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
    </div>
  );
}
