/**
 * Answers a natural-language question grounded in retrieved DreamDash context.
 *
 * Uses the same local Ollama box as the recordings pipeline and the Projets
 * Q&A — nothing leaves the machine. Sources arrive pre-numbered so the model
 * can cite them as `[n]`, which the UI turns into links back to the record.
 */
import type { AskSource, AskSourceType } from "./retrieve";

const OLLAMA_URL = process.env.OLLAMA_URL || "http://100.88.98.44:11434";
const OLLAMA_MODEL =
  process.env.ASK_MODEL || process.env.OLLAMA_MODEL || "qwen2.5:3b";
// Interactive, but the default box is CPU-only: ~15 tok/s of prompt eval and
// ~8 tok/s of generation. With retrieve.ts's ~3.8k-char budget that lands
// around two minutes, so the ceiling has to sit well above it.
const OLLAMA_TIMEOUT_MS = Number(process.env.ASK_TIMEOUT_MS || 240_000);
// Cap generation too — every token costs ~120ms, and a rambling answer would
// add minutes on top of prompt eval.
const MAX_ANSWER_TOKENS = Number(process.env.ASK_MAX_ANSWER_TOKENS || 320);

const TYPE_LABEL: Record<AskSourceType, string> = {
  task: "Tâche",
  event: "Calendrier",
  note: "Note",
  recording: "Enregistrement",
  project: "Projet",
  activity: "Activité projet",
};

function buildPrompt(question: string, sources: AskSource[]): string {
  const today = new Date().toLocaleString("fr-CA", {
    dateStyle: "full",
    timeStyle: "short",
  });

  const context = sources
    .map((s) => `[${s.n}] (${TYPE_LABEL[s.type]}) ${s.content}`)
    .join("\n");

  return [
    "Tu es l'assistant de recherche de DreamDash, l'espace personnel de",
    "l'utilisateur regroupant son calendrier, ses tâches, ses projets, ses",
    "notes Obsidian et ses enregistrements audio.",
    "",
    `Date et heure actuelles : ${today}.`,
    "",
    "Ci-dessous, des extraits numérotés tirés de ses données. Réponds à sa",
    "demande en te basant UNIQUEMENT sur ces extraits.",
    "",
    "Règles :",
    // A concrete example sentence here gets copied verbatim by small models —
    // keep the illustration schematic so there is no content to plagiarize.
    "- OBLIGATOIRE : après chaque information, écris le numéro de l'extrait",
    "  d'où elle vient, entre crochets, selon le gabarit :",
    "  « <fait tiré de l'extrait> [<numéro de cet extrait>] »",
    "  N'utilise que des numéros présents dans la liste des extraits.",
    "- Si les extraits ne contiennent pas la réponse, dis-le franchement.",
    "  N'invente jamais une tâche, un événement ou une note.",
    "- Sois bref et concret : dates, titres, noms. Pas de préambule.",
    "- Réponds dans la langue de la demande.",
    "",
    "Extraits :",
    context,
    "",
    `Demande : ${question}`,
    "",
    "Réponse (en phrases naturelles, chaque fait suivi de son numéro",
    "d'extrait entre crochets) :",
  ].join("\n");
}

/**
 * Ask the local model. Throws on transport/HTTP errors so the route can
 * surface a clean failure to the UI.
 */
export async function answerFromSources(
  question: string,
  sources: AskSource[]
): Promise<string> {
  if (sources.length === 0) {
    return "Je n'ai rien trouvé dans ton calendrier, tes tâches, tes notes ni tes enregistrements pour cette demande.";
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
        prompt: buildPrompt(question, sources),
        stream: false,
        options: { temperature: 0.2, num_predict: MAX_ANSWER_TOKENS },
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
