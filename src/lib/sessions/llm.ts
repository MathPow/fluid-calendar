/**
 * Local LLM calls for session compilation. Nothing leaves the tailnet.
 *
 * Points at canardo's Ollama, not the one the recordings pipeline uses: uguiso
 * has no GPU, and a model big enough to condense four hours of conversation
 * into decisions someone will act on doesn't finish there (a 27B on those 4
 * cores didn't return in 10 minutes). qwen2.5:14b fits canardo's 12 GB card and
 * answers a chunk in ~10s warm, which is what makes a 24-chunk call practical.
 */
const OLLAMA_URL = process.env.SESSION_LLM_URL || "http://100.87.10.111:11434";
const SESSION_MODEL = process.env.SESSION_LLM_MODEL || "qwen2.5:14b";
const TIMEOUT_MS = Number(process.env.SESSION_LLM_TIMEOUT_MS || 15 * 60 * 1000);

/** Run one completion. Throws on transport/HTTP/empty errors. */
export async function generate(
  prompt: string,
  opts?: { temperature?: number; model?: string; numCtx?: number }
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: opts?.model || SESSION_MODEL,
        prompt,
        stream: false,
        options: {
          temperature: opts?.temperature ?? 0.2,
          // Chunk summaries are small, but the reduce step feeds in every chunk
          // summary at once — give it room rather than silently truncating.
          num_ctx: opts?.numCtx ?? 16384,
        },
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Ollama HTTP ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = (await res.json()) as { response?: string };
  const text = stripThinking(data.response ?? "").trim();
  if (!text) throw new Error("Ollama returned an empty response");
  return text;
}

/**
 * Strip <think>…</think> blocks. Reasoning models (qwen3 and friends) emit them
 * inline, and they'd otherwise land verbatim in the digest the agent reads.
 */
function stripThinking(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/^[\s\S]*?<\/think>/i, "");
}
