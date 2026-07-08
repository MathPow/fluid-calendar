"use client";

import { useState } from "react";

import { Sparkles } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Textarea } from "@/components/ui/textarea";

/**
 * Natural-language Q&A over the Projets activity feed. Omit `slug` for a
 * question across all projects; pass it to scope to one repo.
 */
export function AskBox({
  slug,
  placeholder = "Pose une question sur ce qui a été fait…",
}: {
  slug?: string;
  placeholder?: string;
}) {
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
    <div className="mb-5 rounded-xl border border-border bg-card p-4">
      <div className="flex items-start gap-2">
        <Textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            // Enter submits; Shift+Enter for a newline.
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              ask();
            }
          }}
          placeholder={placeholder}
          rows={2}
          className="min-h-0 flex-1 resize-none"
          disabled={loading}
        />
        <Button onClick={ask} disabled={loading || !question.trim()}>
          {loading ? (
            <LoadingSpinner size="sm" />
          ) : (
            <>
              <Sparkles className="h-4 w-4" /> Demander
            </>
          )}
        </Button>
      </div>

      {error ? (
        <p className="mt-3 text-sm text-destructive">{error}</p>
      ) : null}

      {answer ? (
        <div className="mt-3 border-t border-border pt-3 text-sm leading-7 text-foreground/90 [&_li]:ml-5 [&_li]:list-disc [&_p]:mb-2 [&_strong]:font-semibold">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{answer}</ReactMarkdown>
        </div>
      ) : null}
    </div>
  );
}
