import { generate } from "./llm";
import { formatTimestamp } from "./timeline";

/**
 * Turns hours of transcript into the two cheap artefacts an agent actually reads
 * up front:
 *
 *   toc    — a table of contents: ~10-minute chunks, each with 2-3 lines and
 *            topic tags. This is how the agent decides WHERE to look.
 *   digest — decisions, requested changes, actions and open questions, each
 *            carrying the timestamp it came from, so any claim can be traced
 *            back to the verbatim with get_segment().
 *
 * Neither replaces the transcript. They're the index; the transcript stays in
 * the database and is pulled a few minutes at a time, on demand.
 */

/** Default chunk width. Ten minutes is roughly one topic in a working call. */
const DEFAULT_WINDOW_SEC = Number(process.env.SESSION_CHUNK_SEC || 600);
/** Hard cap on characters fed to the model per chunk, as a runaway guard. */
const MAX_CHUNK_CHARS = 12000;

export interface SessionSegment {
  recordingId: string;
  /** Position on the session-wide timeline, not within its own file. */
  startSec: number;
  endSec: number;
  text: string;
}

export interface Chunk {
  startSec: number;
  endSec: number;
  text: string;
}

export interface ChunkSummary extends Chunk {
  summary: string;
  tags: string[];
}

/** Group segments into fixed-width windows on the session timeline. */
export function chunkSegments(
  segments: SessionSegment[],
  windowSec: number = DEFAULT_WINDOW_SEC
): Chunk[] {
  const sorted = [...segments].sort((a, b) => a.startSec - b.startSec);
  const chunks: Chunk[] = [];

  let current: { startSec: number; endSec: number; parts: string[] } | null = null;
  for (const seg of sorted) {
    // Start a new chunk when this segment falls outside the current window, so
    // chunk boundaries land between sentences rather than mid-word.
    if (!current || seg.startSec >= current.startSec + windowSec) {
      if (current) {
        chunks.push({
          startSec: current.startSec,
          endSec: current.endSec,
          text: current.parts.join(" "),
        });
      }
      current = { startSec: seg.startSec, endSec: seg.endSec, parts: [] };
    }
    current.parts.push(seg.text);
    current.endSec = Math.max(current.endSec, seg.endSec);
  }
  if (current) {
    chunks.push({
      startSec: current.startSec,
      endSec: current.endSec,
      text: current.parts.join(" "),
    });
  }

  return chunks.filter((c) => c.text.trim() !== "");
}

interface DigestContext {
  title: string;
  /** The user's written direction — steers what counts as important. */
  brief?: string | null;
  language?: string | null;
}

function isFrench(language?: string | null): boolean {
  return (language ?? "fr").toLowerCase().startsWith("fr");
}

function clip(text: string): string {
  return text.length > MAX_CHUNK_CHARS
    ? text.slice(0, MAX_CHUNK_CHARS) + " …[tronqué]"
    : text;
}

/** Summarize one chunk into 2-3 lines + topic tags (the map step). */
export async function summarizeChunk(
  chunk: Chunk,
  ctx: DigestContext
): Promise<ChunkSummary> {
  const fr = isFrench(ctx.language);
  const window = `${formatTimestamp(chunk.startSec)}–${formatTimestamp(chunk.endSec)}`;

  const prompt = fr
    ? [
        "Tu indexes la transcription d'un appel de travail.",
        `Voici l'extrait ${window} de l'appel « ${ctx.title} ».`,
        ctx.brief
          ? `Contexte — ce que l'utilisateur veut en tirer : ${ctx.brief.slice(0, 600)}`
          : "",
        "",
        "Réponds EXACTEMENT dans ce format, sans rien ajouter :",
        "RESUME: deux ou trois phrases sur ce qui se dit concrètement dans cet extrait.",
        "TAGS: 2 à 4 mots-clés en minuscules, séparés par des virgules",
        "",
        "N'invente rien. Si l'extrait est du bavardage sans contenu, écris RESUME: (rien de substantiel).",
        "",
        "Extrait :",
        "```",
        clip(chunk.text),
        "```",
      ]
    : [
        "You are indexing the transcript of a working call.",
        `This is excerpt ${window} of the call "${ctx.title}".`,
        ctx.brief
          ? `Context — what the user wants out of it: ${ctx.brief.slice(0, 600)}`
          : "",
        "",
        "Answer EXACTLY in this format, nothing else:",
        "RESUME: two or three sentences on what is concretely discussed here.",
        "TAGS: 2 to 4 lowercase keywords, comma-separated",
        "",
        "Invent nothing. If the excerpt is small talk, write RESUME: (nothing substantive).",
        "",
        "Excerpt:",
        "```",
        clip(chunk.text),
        "```",
      ];

  const raw = await generate(prompt.filter(Boolean).join("\n"), { temperature: 0.2 });
  return { ...chunk, ...parseChunkResponse(raw) };
}

/** Lenient parse of the RESUME/TAGS format — models drift, the pipeline shouldn't break. */
export function parseChunkResponse(raw: string): { summary: string; tags: string[] } {
  const summaryMatch = raw.match(/RESUME\s*:\s*([\s\S]*?)(?:\n\s*TAGS\s*:|$)/i);
  const tagsMatch = raw.match(/TAGS\s*:\s*(.+)/i);

  const summary = (summaryMatch?.[1] ?? raw).trim().replace(/\s*\n\s*/g, " ");
  const rawTags = (tagsMatch?.[1] ?? "").trim();
  // Models drift between "a, b" and "a b" for the tag line; treat whitespace as
  // a separator too, otherwise a whole phrase lands as one bogus tag.
  const tags = (rawTags.includes(",") ? rawTags.split(",") : rawTags.split(/\s+/))
    .map((t) => t.trim().toLowerCase().replace(/^#/, ""))
    .filter((t) => t.length > 0 && t.length <= 30)
    .slice(0, 4);

  return { summary: summary.slice(0, 600), tags };
}

/** Render chunk summaries as the markdown table of contents. */
export function renderToc(summaries: ChunkSummary[]): string {
  return summaries
    .map((s) => {
      const window = `[${formatTimestamp(s.startSec)}–${formatTimestamp(s.endSec)}]`;
      const tags = s.tags.length ? `  \n  ${s.tags.map((t) => `#${t}`).join(" ")}` : "";
      return `- **${window}** ${s.summary}${tags}`;
    })
    .join("\n");
}

/**
 * Reduce chunk summaries into the digest. Only summaries go in — never the raw
 * transcript — which is what keeps this one call regardless of call length.
 */
export async function buildDigest(
  summaries: ChunkSummary[],
  ctx: DigestContext
): Promise<string> {
  const fr = isFrench(ctx.language);

  const timeline = summaries
    .map(
      (s) =>
        `[${formatTimestamp(s.startSec)}–${formatTimestamp(s.endSec)}] ${s.summary}`
    )
    .join("\n");

  const prompt = fr
    ? [
        "Tu prépares un briefing pour un agent de développement qui va modifier du code et des documents.",
        `Appel : « ${ctx.title} ».`,
        ctx.brief ? `\nCe que l'utilisateur attend de ce briefing :\n${ctx.brief}\n` : "",
        "Voici le déroulé horodaté de l'appel :",
        timeline,
        "",
        "Rédige un briefing en Markdown avec ces sections, en OMETTANT toute section vide :",
        "## Décisions — ce qui a été tranché",
        "## Changements demandés — au site, au code, aux documents",
        "## Actions — une ligne par action concrète",
        "## Questions ouvertes — ce qui reste à trancher",
        "",
        "Règles strictes :",
        "- Termine CHAQUE puce par le timestamp d'où elle vient, entre crochets, ex. [1:47:20].",
        "- N'invente rien qui ne soit pas dans le déroulé ci-dessus.",
        "- Sois concret et impératif : « Passer le pricing à 3 paliers », pas « ils ont parlé de pricing ».",
        "- Pas de préambule, pas de conclusion. Commence directement par la première section.",
      ]
    : [
        "You are preparing a briefing for a coding agent that will change code and documents.",
        `Call: "${ctx.title}".`,
        ctx.brief ? `\nWhat the user expects from this briefing:\n${ctx.brief}\n` : "",
        "Here is the timestamped run of the call:",
        timeline,
        "",
        "Write a Markdown briefing with these sections, OMITTING any that would be empty:",
        "## Decisions",
        "## Requested changes — to the site, the code, the documents",
        "## Actions — one line per concrete action",
        "## Open questions",
        "",
        "Strict rules:",
        "- End EVERY bullet with the timestamp it came from, in brackets, e.g. [1:47:20].",
        "- Invent nothing that isn't in the run above.",
        "- Be concrete and imperative.",
        "- No preamble, no conclusion. Start directly with the first section.",
      ];

  return generate(prompt.filter(Boolean).join("\n"), {
    temperature: 0.2,
    numCtx: 32768,
  });
}
