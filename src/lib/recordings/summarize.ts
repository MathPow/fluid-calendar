/**
 * Summary via a local LLM on canardo (Ollama). Fully private — the transcript
 * never leaves the box. Reachable from the app container at the host Tailscale IP.
 */
const OLLAMA_URL = process.env.OLLAMA_URL || "http://100.88.98.44:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "qwen2.5:3b";
const OLLAMA_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS || 30 * 60 * 1000);
// Cap transcript length fed to the model — prompt eval is the slow part on a
// CPU box, and very long meetings would otherwise take forever / blow context.
const MAX_TRANSCRIPT_CHARS = Number(process.env.SUMMARY_MAX_CHARS || 16000);

/** Map a whisper ISO-639-1 code to a language name for the prompt. */
function languageName(code?: string): string | undefined {
  if (!code) return undefined;
  const map: Record<string, string> = {
    fr: "French",
    en: "English",
    es: "Spanish",
    de: "German",
    it: "Italian",
    pt: "Portuguese",
    nl: "Dutch",
  };
  return map[code.toLowerCase()] ?? code;
}

function buildPrompt(
  transcript: string,
  opts?: { title?: string; language?: string }
): string {
  const clipped =
    transcript.length > MAX_TRANSCRIPT_CHARS
      ? transcript.slice(0, MAX_TRANSCRIPT_CHARS) + "\n…[truncated]"
      : transcript;

  const lang = languageName(opts?.language);

  return [
    "You are a meeting-notes assistant like Fireflies or Meetily.",
    "Summarize the transcript below.",
    lang
      ? `Write your ENTIRE summary in ${lang} (the transcript's language).`
      : "Write the summary in the same language as the transcript.",
    "Use concise Markdown with these sections, and OMIT any section that would be empty:",
    "## TL;DR — 1-2 sentences",
    "## Key points — bullet list",
    "## Decisions — bullet list",
    "## Action items — bullet list, prefix each with the owner if mentioned",
    "Do not invent details that aren't in the transcript. Do not output empty bullets.",
    opts?.title ? `\nRecording title: ${opts.title}` : "",
    "\nTranscript:\n```\n" + clipped + "\n```",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Generate a Markdown summary of a transcript. Throws on transport/HTTP errors. */
export async function summarizeTranscript(
  transcript: string,
  opts?: { title?: string; language?: string }
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt: buildPrompt(transcript, opts),
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
  const summary = (data.response ?? "").trim();
  if (!summary) throw new Error("Ollama returned an empty summary");
  return summary;
}
