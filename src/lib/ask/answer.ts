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

/** Extracts kept for the stricter retry — less to read, less to parrot. */
const STRICT_SOURCES = 6;

const TYPE_LABEL: Record<AskSourceType, string> = {
  task: "Tâche",
  event: "Calendrier",
  note: "Note",
  recording: "Enregistrement",
  project: "Projet",
  activity: "Activité projet",
  machine: "Machine",
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
    "- Commence par répondre directement à la question, en phrases",
    "  complètes, avec les faits concrets tirés des extraits (noms, états,",
    "  dates, chiffres). Ne te contente pas de renvoyer aux extraits.",
    "- Désigne chaque élément par son nom (titre, nom de machine), jamais",
    "  par son numéro d'extrait. Recopie les états et chiffres tels quels.",
    // No template or example sentence here at all: small models copy either
    // one verbatim (a schematic « <fait tiré de l'extrait> [<n>] » came back
    // as the whole answer). Describe the rule in words only.
    "- Après chaque information, ajoute le numéro de l'extrait qui la",
    "  contient, entre crochets droits, par exemple [2]. N'utilise que des",
    "  numéros présents dans la liste des extraits.",
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
 * Retry prompt for when the first answer was unusable: fewer extracts, a
 * shorter brief, still no template to copy.
 */
function buildStrictPrompt(question: string, sources: AskSource[]): string {
  const context = sources
    .slice(0, STRICT_SOURCES)
    .map((s) => `[${s.n}] (${TYPE_LABEL[s.type]}) ${s.content}`)
    .join("\n");

  return [
    "Extraits des données de l'utilisateur :",
    context,
    "",
    `Question : ${question}`,
    "",
    "Réponds à la question en une à trois phrases complètes, avec les faits",
    "des extraits (noms, états, dates, chiffres), en nommant chaque élément",
    "par son nom et en recopiant ses états tels quels. Après chaque fait, mets le",
    "numéro de son extrait entre crochets droits. Aucun chevron, aucune",
    "consigne recopiée. Réponds dans la langue de la question.",
    "",
    "Réponse :",
  ].join("\n");
}

async function generate(prompt: string, temperature: number): Promise<string> {
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
        options: { temperature, num_predict: MAX_ANSWER_TOKENS },
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
  return (data.response ?? "").trim();
}

/**
 * Ask the local model. Throws on transport/HTTP errors so the route can
 * surface a clean failure to the UI. An unusable answer (empty, or the
 * instructions parroted back) gets one stricter retry, then an answer
 * written straight from the top sources — never just a list of links.
 */
export async function answerFromSources(
  question: string,
  sources: AskSource[]
): Promise<string> {
  if (sources.length === 0) {
    return "Je n'ai rien trouvé dans ton calendrier, tes tâches, tes notes ni tes enregistrements pour cette demande.";
  }

  const answer = await generate(buildPrompt(question, sources), 0.2);
  if (answer && !isTemplateEcho(answer)) return answer;

  const retry = await generate(buildStrictPrompt(question, sources), 0);
  if (retry && !isTemplateEcho(retry)) return retry;

  return answerFromFacts(sources);
}

/**
 * True when the model parroted instructions instead of answering: angle-
 * bracket placeholders (« <fait…> », « [<1>] »), or nothing left once the
 * citations are removed.
 */
function isTemplateEcho(answer: string): boolean {
  if (/<[^<>\n]{2,60}>/.test(answer)) return true;
  const bare = answer.replace(/\[\s*<?\d+>?\s*\]/g, "").replace(/[\s.,;:«»"'-]/g, "");
  return bare.length < 12;
}

/** Last resort when the model can't phrase it: state the top facts as sentences. */
function answerFromFacts(sources: AskSource[]): string {
  return sources
    .slice(0, STRICT_SOURCES)
    .map((s) => {
      const detail = s.subtitle ? ` : ${s.subtitle}` : "";
      return `${TYPE_LABEL[s.type]} « ${s.title} »${detail} [${s.n}].`;
    })
    .join("\n");
}
