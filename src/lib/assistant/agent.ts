/**
 * The mascot assistant: a Claude tool-use loop over the user's DreamDash data
 * (./tools), streamed to the chat as NDJSON {@link AssistantEvent}s.
 *
 * Without ANTHROPIC_API_KEY it falls back to the local Ollama « Ask » pipeline
 * (one retrieval pass + one answer) so the widget still works, just slower and
 * shallower.
 */
import Anthropic from "@anthropic-ai/sdk";

import { answerFromSources } from "@/lib/ask/answer";
import { retrieveSources } from "@/lib/ask/retrieve";
import { logger } from "@/lib/logger";

import { USER_TZ } from "./links";
import {
  type LinkItem,
  type LinkRegistry,
  TOOL_DEFS,
  describeToolCall,
  runTool,
} from "./tools";

const LOG_SOURCE = "assistant-agent";

const MODEL = process.env.ASSISTANT_MODEL || "claude-opus-5-5";
const EFFORT = (process.env.ASSISTANT_EFFORT || "medium") as
  | "low"
  | "medium"
  | "high";
/** Hard stop on tool round-trips, so a confused run can't loop forever. */
const MAX_TURNS = 12;

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface PageContext {
  path: string;
  title?: string;
  /** What the page says is open right now (useAssistantStore.focus). */
  focus?: string | null;
}

export type AssistantEvent =
  | { type: "status"; text: string }
  | { type: "thinking"; text: string }
  | { type: "text"; text: string }
  | { type: "links"; items: LinkItem[] }
  | { type: "error"; text: string }
  | { type: "done" };

const SYSTEM = `Tu es l'assistant de DreamDash — la mascotte noire en bas à droite de l'écran. DreamDash est l'espace personnel de l'utilisateur : calendrier, tâches, projets, notes Obsidian, enregistrements audio, contacts et courriels (plusieurs boîtes IMAP).

Ton rôle : répondre à ses questions en fouillant SES données avec les outils, comme un adjoint qui connaît son système. Fais autant de recherches qu'il faut (variantes de mots-clés, autre dossier courriel, lecture du message ou de la note complète) avant de conclure ; ne t'arrête pas au premier résultat vide. Pour une question générale du monde (pas sur ses données), utilise la recherche web.

Liens — c'est essentiel : chaque résultat d'outil porte un champ \`url\` (chemin interne comme /email?..., /tasks?task=..., /calendar?date=..., /notes?path=...). Quand tu mentionnes un élément précis, mets-le en lien Markdown avec EXACTEMENT cette url : [titre](url). N'invente jamais d'url ; n'utilise que celles reçues des outils (ou des liens https du web).

Style : réponds dans la langue de l'utilisateur (souvent le français québécois), bref et concret — dates, expéditeurs, titres. Listes à puces quand il y a plusieurs éléments. Pas de préambule. Si tu ne trouves rien, dis-le franchement et dis où tu as cherché.

Tu es en lecture seule : tu ne peux pas envoyer de courriel, ni créer ou modifier des tâches ou des événements. Si on te le demande, explique où le faire dans l'app (avec un lien).

Le message de l'utilisateur commence par un bloc <contexte> : la date, la page où il se trouve et l'élément ouvert. Sers-t'en pour comprendre « ça », « ce courriel », « aujourd'hui », etc.`;

function contextBlock(ctx: PageContext): string {
  const now = new Date().toLocaleString("fr-CA", {
    timeZone: USER_TZ,
    dateStyle: "full",
    timeStyle: "short",
  });
  return [
    "<contexte>",
    `Maintenant : ${now} (${USER_TZ})`,
    `Page : ${ctx.path}${ctx.title ? ` — ${ctx.title}` : ""}`,
    ctx.focus ? `Élément ouvert : ${ctx.focus}` : null,
    "</contexte>",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Links worth showing as cards: the ones the answer cites, else the first few found. */
function pickLinks(answer: string, registry: LinkRegistry): LinkItem[] {
  const all = [...registry.values()];
  const cited = all.filter((l) => answer.includes(`](${l.url})`));
  return (cited.length ? cited : all.slice(0, 5)).slice(0, 12);
}

export async function* runAssistant(
  userId: string,
  history: ChatTurn[],
  ctx: PageContext
): AsyncGenerator<AssistantEvent> {
  if (!process.env.ANTHROPIC_API_KEY) {
    yield* runLocalFallback(userId, history, ctx);
    return;
  }

  const client = new Anthropic();
  const registry: LinkRegistry = new Map();

  // Plain-text history; the page context rides on the newest user turn only.
  const messages: Anthropic.Beta.BetaMessageParam[] = history.map((t, i) => ({
    role: t.role,
    content:
      i === history.length - 1 && t.role === "user"
        ? `${contextBlock(ctx)}\n\n${t.content}`
        : t.content,
  }));

  const tools: Anthropic.Beta.BetaToolUnion[] = [
    ...TOOL_DEFS,
    { type: "web_search_20260209", name: "web_search", max_uses: 4 },
  ];

  let answer = "";

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const stream = client.beta.messages.stream({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      thinking: { type: "adaptive", display: "summarized" },
      output_config: { effort: EFFORT },
      cache_control: { type: "ephemeral" },
      system: SYSTEM,
      tools,
      messages,
    });

    // Pump deltas out of the event-emitter API into this generator.
    const queue: AssistantEvent[] = [];
    let wake: (() => void) | null = null;
    const push = (e: AssistantEvent) => {
      queue.push(e);
      wake?.();
    };
    stream.on("text", (delta) => {
      answer += delta;
      push({ type: "text", text: delta });
    });
    stream.on("thinking", (delta) => push({ type: "thinking", text: delta }));
    stream.on("contentBlock", (block) => {
      if (block.type === "server_tool_use" && block.name === "web_search") {
        push({ type: "status", text: describeToolCall("web_search", block.input) });
      }
    });

    let finished = false;
    const final = stream.finalMessage().finally(() => {
      finished = true;
      wake?.();
    });
    while (!finished || queue.length) {
      if (queue.length) {
        yield queue.shift()!;
        continue;
      }
      await new Promise<void>((r) => (wake = r));
      wake = null;
    }
    let message: Anthropic.Beta.BetaMessage;
    try {
      message = await final;
    } catch (error) {
      // A missing/revoked key or an empty balance shouldn't leave the mascot
      // mute: before anything was said, hand over to the local pipeline.
      if (
        turn === 0 &&
        !answer &&
        (error instanceof Anthropic.AuthenticationError ||
          error instanceof Anthropic.PermissionDeniedError ||
          (error instanceof Anthropic.BadRequestError &&
            /credit balance/i.test(error.message)))
      ) {
        logger.error("Claude unavailable, using local model", { error: error.message }, LOG_SOURCE);
        yield* runLocalFallback(userId, history, ctx);
        return;
      }
      throw error;
    }

    if (message.stop_reason === "refusal") {
      yield { type: "error", text: "Je ne peux pas répondre à cette demande." };
      break;
    }
    if (message.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: message.content });
      continue;
    }

    const toolUses = message.content.filter(
      (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use"
    );
    if (message.stop_reason !== "tool_use" || toolUses.length === 0) break;

    messages.push({ role: "assistant", content: message.content });
    for (const t of toolUses) {
      yield { type: "status", text: describeToolCall(t.name, t.input) };
    }
    const results = await Promise.all(
      toolUses.map(async (t): Promise<Anthropic.Beta.BetaToolResultBlockParam> => {
        try {
          return {
            type: "tool_result",
            tool_use_id: t.id,
            content: await runTool(userId, t.name, t.input, registry),
          };
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          logger.warn("Assistant tool failed", { tool: t.name, error: msg }, LOG_SOURCE);
          return { type: "tool_result", tool_use_id: t.id, is_error: true, content: msg };
        }
      })
    );
    messages.push({ role: "user", content: results });
    // Separate the text of successive turns so it doesn't run together.
    if (answer && !answer.endsWith("\n")) {
      answer += "\n\n";
      yield { type: "text", text: "\n\n" };
    }
  }

  yield { type: "links", items: pickLinks(answer, registry) };
  yield { type: "done" };
}

/** No API key: the local Ollama « Ask » pipeline (no mail search, no tools). */
async function* runLocalFallback(
  userId: string,
  history: ChatTurn[],
  ctx: PageContext
): AsyncGenerator<AssistantEvent> {
  const question = [...history].reverse().find((t) => t.role === "user")?.content ?? "";
  yield { type: "status", text: "Recherche dans DreamDash (modèle local)" };
  const sources = await retrieveSources(userId, question);
  const registry: LinkRegistry = new Map();
  for (const s of sources) {
    registry.set(s.url, { type: s.type, title: s.title, subtitle: s.subtitle, url: s.url });
  }
  yield { type: "status", text: "Rédaction de la réponse (peut prendre une minute ou deux)" };
  const contextual = ctx.focus ? `${question}\n(Élément ouvert : ${ctx.focus})` : question;
  const raw = await answerFromSources(contextual, sources);
  // Turn the [n] citations into links to the numbered source.
  const answer = raw.replace(/\[(\d+)\]/g, (m, n) => {
    const s = sources.find((x) => x.n === Number(n));
    return s ? `[[${n}]](${s.url})` : m;
  });
  yield { type: "text", text: answer };
  yield { type: "links", items: pickLinks(answer, registry) };
  yield { type: "done" };
}
