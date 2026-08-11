"use client";

import { useState } from "react";

import { Loader2, Search } from "lucide-react";

interface Hit {
  timestamp: string;
  text: string;
  recordingTitle: string;
}

/**
 * The same level-3 retrieval the agent gets over MCP, exposed to the user — so
 * you can check what Claude will find (and whether the lexicon spelled a name
 * the way you'd search for it) without leaving the page.
 */
export function TranscriptSearch({ sessionId }: { sessionId: string }) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/sessions/${sessionId}/search?q=${encodeURIComponent(query)}`
      );
      if (!res.ok) throw new Error("search failed");
      const data = await res.json();
      setHits(data.hits ?? []);
    } catch {
      setError("La recherche a échoué.");
      setHits(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h3 className="mb-1 flex items-center gap-1.5 text-sm font-semibold">
        <Search className="h-4 w-4 text-primary" /> Fouiller le verbatim
      </h3>
      <p className="mb-3 text-xs text-muted-foreground">
        Recherche plein texte française. Les guillemets font une expression exacte,
        le tiret exclut : <code>&quot;trois paliers&quot; -logo</code>
      </p>

      <div className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") run();
          }}
          placeholder="pricing, plan d'affaires, nom d'entreprise…"
          className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        />
        <button
          type="button"
          onClick={run}
          disabled={loading || !query.trim()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Chercher"}
        </button>
      </div>

      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

      {hits && (
        <div className="mt-3">
          {hits.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun résultat.</p>
          ) : (
            <ul className="space-y-2">
              {hits.map((h, i) => (
                <li
                  key={`${h.timestamp}-${i}`}
                  className="rounded-lg border border-border bg-muted/30 p-3 text-sm"
                >
                  <span className="mr-2 font-mono text-xs text-primary">
                    {h.timestamp}
                  </span>
                  <span className="text-foreground/90">{h.text}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
