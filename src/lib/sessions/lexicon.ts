/**
 * The lexicon is the list of proper nouns a call is full of and whisper is worst
 * at: company names, project names, the two people talking. It's entered BEFORE
 * transcription because it changes decoding, not post-processing — there's no
 * fixing a mangled name afterwards without a find-and-replace that also mangles
 * real words.
 *
 * It feeds whisper two different levers:
 *   - `hotwords`  — biases the decoder toward these tokens. The reliable one.
 *   - `prompt`    — an initial-prompt sentence that primes spelling and register.
 *                   Whisper only conditions on ~224 tokens of it, so it's capped.
 *
 * Input format, one entry per line:
 *     Mathys
 *     StayChum = notre app de colocation
 *     Uguiso Technologies
 * The part after "=" is context for the prompt only; hotwords get the term.
 */

/** Whisper conditions on ~224 tokens of prompt; stay well under in characters. */
const MAX_PROMPT_CHARS = 700;
/** Guard against someone pasting a dictionary — biasing on everything biases on nothing. */
const MAX_TERMS = 80;

export interface LexiconEntry {
  term: string;
  note?: string;
}

/** Parse raw lexicon text into terms + optional context notes. */
export function parseLexicon(raw: string | null | undefined): LexiconEntry[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const entries: LexiconEntry[] = [];

  for (const line of raw.split(/\r?\n/)) {
    // Allow "#" comments so the user can group terms with headings.
    const trimmed = line.trim().replace(/^[-*]\s+/, "");
    if (!trimmed || trimmed.startsWith("#")) continue;

    const [termPart, ...noteParts] = trimmed.split("=");
    const term = termPart.trim();
    if (!term) continue;

    const key = term.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const note = noteParts.join("=").trim();
    entries.push({ term, note: note || undefined });
    if (entries.length >= MAX_TERMS) break;
  }

  return entries;
}

/**
 * Build the `hotwords` string. faster-whisper takes one space-separated string
 * and biases decoding toward it; multi-word terms work as-is.
 */
export function buildHotwords(entries: LexiconEntry[]): string | undefined {
  if (entries.length === 0) return undefined;
  return entries.map((e) => e.term).join(", ");
}

/**
 * Build the initial prompt. Whisper mimics the prompt's style, so it's written
 * as a natural sentence naming the terms rather than a bare list — a list makes
 * whisper start transcribing in list form.
 */
export function buildPrompt(
  entries: LexiconEntry[],
  opts?: { title?: string; language?: string }
): string | undefined {
  if (entries.length === 0 && !opts?.title) return undefined;

  const isFrench = (opts?.language ?? "fr").toLowerCase().startsWith("fr");
  const named = entries.map((e) => e.term);

  const parts: string[] = [];
  if (isFrench) {
    parts.push(
      opts?.title
        ? `Conversation d'affaires au sujet de ${opts.title}.`
        : "Conversation d'affaires."
    );
    if (named.length) {
      parts.push(`On y parle de : ${named.join(", ")}.`);
    }
  } else {
    parts.push(
      opts?.title
        ? `A business conversation about ${opts.title}.`
        : "A business conversation."
    );
    if (named.length) {
      parts.push(`It mentions: ${named.join(", ")}.`);
    }
  }

  let prompt = parts.join(" ");
  if (prompt.length > MAX_PROMPT_CHARS) {
    // Truncate at a term boundary so we never cut a name in half.
    prompt = prompt.slice(0, MAX_PROMPT_CHARS);
    const lastComma = prompt.lastIndexOf(",");
    if (lastComma > MAX_PROMPT_CHARS / 2) prompt = prompt.slice(0, lastComma);
    prompt += ".";
  }
  return prompt;
}

/** Everything the transcriber needs, derived from one lexicon blob. */
export function lexiconToTranscribeOptions(
  raw: string | null | undefined,
  opts?: { title?: string; language?: string }
): { hotwords?: string; prompt?: string } {
  const entries = parseLexicon(raw);
  return {
    hotwords: buildHotwords(entries),
    prompt: buildPrompt(entries, opts),
  };
}
