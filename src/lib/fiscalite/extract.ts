/**
 * Pull what we can out of a dropped invoice so the form comes prefilled:
 * PDF text (unpdf), then regex heuristics for the Québec invoice shape
 * (Sous-total / TPS / TVQ / Total, RT / TQ numbers), then — when canardo's
 * Ollama answers — a local LLM pass that fills the gaps. Nothing leaves the
 * tailnet. Photos get no text (no OCR here): the form just stays empty.
 */
import { logger } from "@/lib/logger";

import { categoryChoices } from "./category-guess";
import { parseMoney } from "./meta";

const LOG_SOURCE = "fiscalite-extract";

const OLLAMA_URL = process.env.SESSION_LLM_URL || "http://100.87.10.111:11434";
const MODEL = process.env.INVOICE_LLM_MODEL || process.env.SESSION_LLM_MODEL || "qwen2.5:14b";
const LLM_TIMEOUT_MS = Number(process.env.INVOICE_LLM_TIMEOUT_MS || 45_000);

export interface InvoiceGuess {
  direction?: "depense" | "revenu";
  date?: string; // YYYY-MM-DD
  party?: string;
  partyTaxNumber?: string;
  number?: string;
  description?: string;
  subtotalCents?: number;
  gstCents?: number;
  qstCents?: number;
  totalCents?: number;
  /** Category id, filled by category-guess.ts (the LLM's raw pick before that). */
  category?: string;
  categorySource?: "history" | "party" | "llm" | "text";
}

export async function pdfText(bytes: Uint8Array): Promise<string> {
  try {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(bytes);
    const { text } = await extractText(pdf, { mergePages: true });
    return (Array.isArray(text) ? text.join("\n") : text).trim();
  } catch (error) {
    logger.warn(
      "PDF text extraction failed",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return "";
  }
}

const AMOUNT = String.raw`(-?\d{1,3}(?:[   .,]\d{3})*(?:[.,]\d{2})|-?\d+(?:[.,]\d{2}))`;

/** The amount after the last match of `label` (invoices repeat labels in headers). */
function amountAfter(text: string, label: string): number | undefined {
  // Skip over a rate like "(5 %)" or "9,975%" between the label and the amount.
  const re = new RegExp(
    `${label}(?:[^\\d\\n-]|\\d+(?:[.,]\\d+)?\\s*%){0,40}?\\$?\\s*${AMOUNT}(?!\\d)(?!\\s*%)`,
    "gi"
  );
  let found: number | undefined;
  for (const m of text.matchAll(re)) {
    const v = parseMoney(m[1]);
    if (v != null) found = v;
  }
  return found;
}

const MONTHS: Record<string, number> = {
  janv: 1, jan: 1, janvier: 1, january: 1,
  fevr: 2, févr: 2, fev: 2, fév: 2, février: 2, fevrier: 2, feb: 2, february: 2,
  mars: 3, mar: 3, march: 3,
  avr: 4, avril: 4, apr: 4, april: 4,
  mai: 5, may: 5,
  juin: 6, jun: 6, june: 6,
  juil: 7, juillet: 7, jul: 7, july: 7,
  août: 8, aout: 8, aug: 8, august: 8,
  sept: 9, sep: 9, septembre: 9, september: 9,
  oct: 10, octobre: 10, october: 10,
  nov: 11, novembre: 11, november: 11,
  déc: 12, dec: 12, décembre: 12, decembre: 12, december: 12,
};

function iso(y: number, m: number, d: number): string | undefined {
  if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return undefined;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function findDate(text: string): string | undefined {
  // Prefer a date next to a "date" label, else the first one in the document.
  const labelled = text.match(/date(?: de (?:la )?facture| d'émission)?\s*:?\s*([^\n]{6,30})/i)?.[1];
  for (const chunk of [labelled, text]) {
    if (!chunk) continue;
    let m = chunk.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
    if (m) return iso(+m[1], +m[2], +m[3]);
    m = chunk.match(/\b(\d{1,2})\s+([a-zéû]{3,9})\.?\s+(20\d{2})\b/i);
    if (m && MONTHS[m[2].toLowerCase()]) return iso(+m[3], MONTHS[m[2].toLowerCase()], +m[1]);
    m = chunk.match(/\b([a-z]{3,9})\.?\s+(\d{1,2}),?\s+(20\d{2})\b/i);
    if (m && MONTHS[m[1].toLowerCase()]) return iso(+m[3], MONTHS[m[1].toLowerCase()], +m[2]);
    m = chunk.match(/\b(\d{1,2})[/.](\d{1,2})[/.](20\d{2})\b/);
    // dd/mm/yyyy is the Québec habit; mm/dd only when the first can't be a month.
    if (m) return +m[2] > 12 ? iso(+m[3], +m[1], +m[2]) : iso(+m[3], +m[2], +m[1]);
  }
  return undefined;
}

/** Regex pass. `orgNames` are the company's own names: they tell issued from received. */
export function guessFromText(text: string, orgNames: string[] = []): InvoiceGuess {
  const g: InvoiceGuess = {};
  if (!text) return g;
  const flat = text.replace(/\r/g, "");

  g.subtotalCents = amountAfter(flat, String.raw`(?:sous[- ]?total|subtotal|montant avant taxes)`);
  g.gstCents = amountAfter(flat, String.raw`(?:TPS|GST|T\.P\.S\.)(?!\s*(?:no|n°|#|:?\s*\d{9}))`);
  g.qstCents = amountAfter(flat, String.raw`(?:TVQ|QST|T\.V\.Q\.)(?!\s*(?:no|n°|#|:?\s*\d{10}))`);
  g.totalCents =
    amountAfter(flat, String.raw`(?:grand total|total (?:à payer|dû|du|due|TTC)|montant dû|amount due|total)(?!\s*partiel)`);
  if (g.totalCents == null && g.subtotalCents != null) {
    g.totalCents = g.subtotalCents + (g.gstCents ?? 0) + (g.qstCents ?? 0);
  }
  if (g.subtotalCents == null && g.totalCents != null) {
    g.subtotalCents = g.totalCents - (g.gstCents ?? 0) - (g.qstCents ?? 0);
  }

  g.date = findDate(flat);
  g.number = flat.match(
    /(?:facture|invoice|reçu|receipt)\s*(?:no\.?|n°|nº|#|number|numéro)\s*:?\s*([A-Z0-9][A-Z0-9-]{1,30})/i
  )?.[1];

  const gstNo = flat.match(/\b(\d{9})\s*RT\s*(\d{4})\b/i);
  const qstNo = flat.match(/\b(\d{10})\s*TQ\s*(\d{4})\b/i);
  const taxNos = [gstNo && `${gstNo[1]}RT${gstNo[2]}`, qstNo && `${qstNo[1]}TQ${qstNo[2]}`].filter(Boolean);

  // Issued by us when our name sits in the letterhead (first lines).
  const head = flat.split("\n").slice(0, 6).join(" ").toLowerCase();
  const ours = orgNames.some((n) => n && head.includes(n.toLowerCase()));
  g.direction = ours ? "revenu" : "depense";
  if (!ours) {
    if (taxNos.length) g.partyTaxNumber = taxNos.join(" · ");
    g.party = flat
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l.length > 2 && l.length < 60 && /[a-z]/i.test(l) && !/facture|invoice|reçu|receipt|date/i.test(l));
  }
  return g;
}

/** Ask the local LLM for the fields. Best effort: returns {} when it's away. */
async function guessWithLlm(
  text: string,
  orgNames: string[],
  personal: boolean,
  ours: boolean
): Promise<InvoiceGuess> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);
  const choices = categoryChoices(personal);
  const prompt = `Tu lis une facture québécoise. Mon entreprise: ${orgNames.join(" / ") || "inconnue"}.
${ours ? "Cette facture a été émise par MON entreprise: c'est un revenu.\n" : ""}Réponds UNIQUEMENT en JSON avec ces clés (null si absent):
{"direction": "revenu" si c'est MON entreprise qui a émis la facture sinon "depense",
 "date": "YYYY-MM-DD" (date de la facture),
 "party": nom de l'AUTRE partie (fournisseur si dépense, client si revenu),
 "partyTaxNumber": numéros TPS (…RT0001) / TVQ (…TQ0001) du fournisseur si dépense,
 "number": numéro de facture,
 "description": ce qui est facturé, 8 mots max,
 "subtotal": montant avant taxes (nombre), "gst": TPS (nombre), "qst": TVQ (nombre), "total": total (nombre),
 "category": l'identifiant (avant la parenthèse) de la catégorie qui convient le mieux,
   pour une dépense parmi: ${choices.expense}
   pour un revenu parmi: ${choices.income}}

FACTURE:
${text.slice(0, 6000)}`;
  try {
    const res = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        prompt,
        stream: false,
        format: "json",
        options: { temperature: 0, num_ctx: 8192 },
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
    const data = (await res.json()) as { response?: string };
    const j = JSON.parse(data.response || "{}") as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
    const money = (v: unknown) =>
      typeof v === "number" ? Math.round(v * 100) : parseMoney(str(v)) ?? undefined;
    const date = str(j.date);
    return {
      direction: j.direction === "revenu" ? "revenu" : j.direction === "depense" ? "depense" : undefined,
      date: date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined,
      party: str(j.party),
      partyTaxNumber: str(j.partyTaxNumber),
      number: str(j.number),
      description: str(j.description),
      subtotalCents: money(j.subtotal),
      gstCents: money(j.gst),
      qstCents: money(j.qst),
      totalCents: money(j.total),
      category: str(j.category),
    };
  } catch (error) {
    logger.info(
      "Invoice LLM pass skipped",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return {};
  } finally {
    clearTimeout(timer);
  }
}

export async function extractInvoice(
  bytes: Uint8Array,
  mime: string,
  orgNames: string[],
  personal = false
): Promise<{ text: string; guess: InvoiceGuess; source: "llm" | "regex" | "none" }> {
  const text = mime === "application/pdf" ? await pdfText(bytes) : "";
  if (!text) return { text, guess: {}, source: "none" };
  const regex = guessFromText(text, orgNames);
  // Our name in the letterhead is a sure sign: the model doesn't get to flip it.
  const ours = regex.direction === "revenu";
  const llm = await guessWithLlm(text, orgNames, personal, ours);
  if (ours) llm.direction = "revenu";
  const merged: InvoiceGuess = { ...regex };
  // The model reads layouts better; the regex is exact on numbers it found.
  for (const [k, v] of Object.entries(llm) as [keyof InvoiceGuess, never][]) {
    if (v == null) continue;
    const isMoney = k.endsWith("Cents");
    if (!isMoney || merged[k] == null) merged[k] = v;
  }
  return { text, guess: merged, source: Object.keys(llm).length ? "llm" : "regex" };
}
