/**
 * Natural-language Q&A over the Projets activity feed. Answers are grounded in
 * the AgentActivity summaries and produced by the same local Ollama model used
 * for recording summaries — fully private, nothing leaves the box.
 */
const OLLAMA_URL = process.env.OLLAMA_URL || "http://100.88.98.44:11434";
const OLLAMA_MODEL =
  process.env.PROJETS_ASK_MODEL || process.env.OLLAMA_MODEL || "qwen2.5:3b";
// Interactive, so keep the ceiling well under the recordings pipeline's — the
// UI shows a spinner while this runs. qwen2.5:3b on CPU answers in ~20-40s.
const OLLAMA_TIMEOUT_MS = Number(process.env.PROJETS_ASK_TIMEOUT_MS || 120_000);
// Prompt eval is the slow part on a CPU box; cap the context we feed in.
const MAX_CONTEXT_CHARS = Number(process.env.PROJETS_ASK_MAX_CHARS || 12_000);

export interface ActivityForContext {
  summary: string;
  createdAt: Date;
  projectName?: string; // set in global (all-projects) mode
}

/** Format the activity feed into a compact, dated context block for the model. */
function buildContext(activities: ActivityForContext[]): string {
  const lines: string[] = [];
  let used = 0;
  for (const a of activities) {
    const stamp = a.createdAt.toLocaleString("fr-CA", {
      dateStyle: "medium",
      timeStyle: "short",
    });
    const prefix = a.projectName ? `[${a.projectName}] ` : "";
    const entry = `- ${stamp} ${prefix}${a.summary.replace(/\s+/g, " ").trim()}`;
    if (used + entry.length > MAX_CONTEXT_CHARS) break;
    lines.push(entry);
    used += entry.length + 1;
  }
  return lines.join("\n");
}

function buildPrompt(
  question: string,
  activities: ActivityForContext[],
  scope: string
): string {
  return [
    "You are an assistant that answers questions about the work done in a set",
    `of software projects (${scope}). Below is a reverse-chronological log of`,
    "activity entries, each a short summary of one turn of agent work, prefixed",
    "with its date (and project name, when several projects are shown).",
    "",
    "Answer the user's question using ONLY the log. Be concise and specific:",
    "cite dates and project names when relevant. If the log does not contain",
    "the answer, say so plainly — do not invent work that isn't listed.",
    "Reply in the same language as the question.",
    "",
    "Activity log:",
    buildContext(activities),
    "",
    `Question: ${question}`,
  ].join("\n");
}

/**
 * Answer a question grounded in the given activity feed. Throws on
 * transport/HTTP errors so the route can surface a clean failure.
 */
export async function answerProjectQuestion(
  question: string,
  activities: ActivityForContext[],
  scope: string
): Promise<string> {
  if (activities.length === 0) {
    return "Aucune activité enregistrée pour l'instant — rien à interroger.";
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt: buildPrompt(question, activities, scope),
        stream: false,
        options: { temperature: 0.2 },
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
  const answer = (data.response ?? "").trim();
  if (!answer) throw new Error("Ollama returned an empty answer");
  return answer;
}
