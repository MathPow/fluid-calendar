"use client";

import { useEffect, useRef, useState } from "react";

import { ArrowRight } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";

/**
 * Natural-language Q&A over the Projets activity feed. Omit `slug` for a
 * question across all projects; pass it to scope to one repo.
 */
export function AskBox({
  slug,
  placeholder = "Pose une question sur ce qui a été fait…",
  focus,
  onEscape,
}: {
  slug?: string;
  placeholder?: string;
  /** Focus the field when this turns true (the box just opened). */
  focus?: boolean;
  onEscape?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    // Wait for the opening transition to start so the page doesn't jump.
    if (focus) {
      const t = setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 150);
      return () => clearTimeout(t);
    }
  }, [focus]);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function ask() {
    const q = question.trim();
    if (!q || loading) return;
    setLoading(true);
    setError(null);
    setAnswer(null);
    try {
      const res = await fetch("/api/projets/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: q, ...(slug ? { slug } : {}) }),
      });
      const data = (await res.json()) as { answer?: string; error?: string };
      if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
      setAnswer(data.answer ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Une erreur est survenue.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="tile p-4 md:p-5">
      {/* Messagerie-style composer: pill field + ink send button */}
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          ask();
        }}
      >
        <input
          ref={inputRef}
          onKeyDown={(e) => {
            if (e.key === "Escape" && onEscape) onEscape();
          }}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={placeholder}
          disabled={loading}
          className="h-12 min-w-0 flex-1 rounded-full border-0 bg-input px-5 text-[15px] text-foreground placeholder:text-muted-foreground focus:bg-card focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
        />
        <Button
          type="submit"
          size="icon"
          className="h-12 w-12 shrink-0"
          disabled={loading || !question.trim()}
          aria-label="Demander"
        >
          {loading ? (
            <LoadingSpinner size="sm" className="text-primary-foreground" />
          ) : (
            <ArrowRight className="h-5 w-5" />
          )}
        </Button>
      </form>

      {loading ? (
        <p className="mt-4 px-1 font-serif text-[15px] italic text-muted-foreground">
          Le modèle tourne en local — compte une à deux minutes.
        </p>
      ) : null}

      {error ? (
        <p className="mt-4 px-1 text-sm text-negative-foreground">{error}</p>
      ) : null}

      {answer ? (
        <div className="mt-4 border-t border-border px-1 pt-4 text-[15px] leading-7 text-foreground/90 [&_li]:ml-5 [&_li]:list-disc [&_p]:mb-2 [&_strong]:font-semibold">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{answer}</ReactMarkdown>
        </div>
      ) : null}
    </div>
  );
}
