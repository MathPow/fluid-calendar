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

/**
 * Generate a short, descriptive title for a transcript (≤8 words), in the
 * transcript's language. Used to replace the default "Enregistrement audio …"
 * filename once a recording is transcribed.
 */
export async function generateTitle(
  transcript: string,
  language?: string
): Promise<string> {
  const lang = languageName(language);
  // The opening of the transcript is enough for a title — keep the prompt small.
  const clipped = transcript.slice(0, 4000);
  const prompt = [
    "Generate a concise, descriptive title for this audio transcript.",
    "Maximum 8 words. No surrounding quotes, no trailing punctuation, no 'Title:' prefix.",
    lang ? `Write the title in ${lang}.` : "Write it in the transcript's language.",
    "\nTranscript:\n```\n" + clipped + "\n```",
  ].join("\n");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt,
        stream: false,
        options: { temperature: 0.3 },
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
  let title = (data.response ?? "").trim();
  // Strip wrapping quotes, a leading "Title:" the small model sometimes adds,
  // and any trailing period; collapse to a single line.
  title = title
    .split("\n")[0]
    .replace(/^["'«»\s]+|["'«».\s]+$/g, "")
    .replace(/^title\s*:\s*/i, "")
    .trim();
  return title.slice(0, 120);
}
