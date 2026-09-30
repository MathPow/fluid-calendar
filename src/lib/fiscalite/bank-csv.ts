/**
 * Bank CSV exports (Wealthsimple chequing, for now) → personal transactions.
 * Two layouts are known:
 * - the activity export (`activities-export-YYYY-MM-DD.csv`): transaction_date,
 *   account_type, activity_type, activity_sub_type, direction, name,
 *   net_cash_amount…, every account in one file;
 *   in English or in French (date_effet, type_compte, sous_type_activite,
 *   description, montant_net_especes…);
 * - the monthly statement: date, transaction, description, amount, balance.
 * Columns are found by header name, so either works, and so does a bank with
 * a similar shape. Amounts are signed: negative is money out.
 */
import type { ParsedInvoice } from "./excel";

export interface ParsedBankCsv {
  invoices: ParsedInvoice[];
  skipped: { sheet: string; row: number; reason: string }[];
  /** Accounts left out because they aren't the chequing account. */
  otherAccounts: string[];
}

/** RFC 4180-ish: quotes, doubled quotes, commas and newlines inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  const sep = detectSeparator(src);
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim()));
}

function detectSeparator(text: string) {
  const first = text.split(/\r?\n/, 1)[0] ?? "";
  const count = (c: string) => first.split(c).length;
  return count(";") > count(",") ? ";" : count("\t") > count(",") ? "\t" : ",";
}

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const HEADERS = {
  date: ["transaction date", "date effet", "date", "posted date", "date de transaction", "date d operation"],
  amount: ["net cash amount", "montant net especes", "amount", "montant", "net amount"],
  debit: ["debit", "withdrawal", "retrait", "withdrawals"],
  credit: ["credit", "deposit", "depot", "deposits"],
  type: ["activity type", "type activite", "transaction", "type", "transaction type"],
  subType: ["activity sub type", "sous type activite", "sub type"],
  direction: ["direction"],
  account: ["account type", "type compte", "account"],
  currency: ["currency", "devise"],
};
// Merchant first, the bank's own label as a fallback: Wealthsimple leaves
// `name` empty on chequing rows and only says "Dépense".
const NAME_HEADERS = ["name", "nom", "payee", "merchant", "beneficiaire", "description", "libelle"];

// Wealthsimple's labels rather than a merchant: never learn a category from
// them, or every "Dépense" would inherit the last one picked.
const GENERIC_PARTY =
  /^(depense|retrait|remboursement|depot|depot direct recu|virement interac.*|argent (envoye|recu)|transfert (sortant|entrant) d.argent|interets recus|spend|withdrawal|deposit|interest)$/;
export const isGenericParty = (party: string) => GENERIC_PARTY.test(fold(party));

/** Wealthsimple sub-types that say what the money is. */
function categoryFromSubType(direction: "depense" | "revenu", subType: string, type: string) {
  const s = fold(subType);
  const t = fold(type);
  if (direction === "revenu") {
    if (t === "interest") return "p-interets";
    if (s === "aft in") return "p-salaire";
  } else if (s === "transfer") return "p-epargne";
  return null;
}

function findCol(head: string[], names: string[]) {
  for (const n of names) {
    const i = head.indexOf(n);
    if (i >= 0) return i;
  }
  return -1;
}

/** "2026-09-30", "2026-09-30T12:00:00Z", "09/30/2026", "30/09/2026". */
function toYmd(raw: string): string | null {
  const s = raw.trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) {
    let [a, b] = [Number(m[1]), Number(m[2])];
    // Month first unless that's impossible.
    if (a > 12) [a, b] = [b, a];
    return `${m[3]}-${String(a).padStart(2, "0")}-${String(b).padStart(2, "0")}`;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function toCents(raw: string | undefined): number | null {
  if (raw == null) return null;
  let s = raw.replace(/[\s $]/g, "").replace(/CAD$/i, "");
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) {
    neg = true;
    s = s.slice(1, -1);
  }
  if (s.includes(",") && !s.includes(".")) s = s.replace(",", ".");
  else s = s.replace(/,/g, "");
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Math.round((neg ? -n : n) * 100);
}

const CHEQUING = /cash|chequing|checking|cheque|cheques|epargne|compte/;

// Merchant keyword → personal category. First match wins; the user can
// always recategorize, and an already-classified merchant keeps its category.
const EXPENSE_RULES: [RegExp, string][] = [
  [/\b(iga|metro|maxi|provigo|super c|loblaws|costco|walmart|adonis|sobeys|tim hortons|mcdonald|starbucks|subway|a w|uber ?eats|doordash|skip ?the ?dishes|restaurant|resto|cafe|boulangerie|pizza|sushi|dollarama)\b/, "p-nourriture"],
  [/\b(esso|shell|petro|ultramar|irving|couche tard|circle k|crevier|sonic)\b/, "p-gaz"],
  [/\b(stm|rtc|exo|rtl|stl|opus|sts)\b/, "p-bus"],
  [/\b(fizz|videotron|bell|rogers|telus|koodo|virgin|fido|public mobile|freedom)\b/, "p-cellulaire"],
  [/\b(netflix|spotify|disney|crave|prime video|apple com bill|youtube|steam|playstation|xbox|nintendo|cinema|cineplex)\b/, "p-divertissement"],
  [/\b(pharmaprix|jean coutu|uniprix|familiprix|brunet|pharmacie|clinique|dentist|dentiste)\b/, "p-sante"],
  [/\b(saaq|garage|canadian tire|pneus|midas|mr lube)\b/, "p-automobile"],
  [/\b(sports experts|decathlon|gym|nautilus|econofitness|energie cardio)\b/, "p-sports"],
  [/\b(simons|h m|uniqlo|zara|winners|old navy|sports ?experts)\b/, "p-vetements"],
  [/\b(godaddy|namecheap|cloudflare|porkbun|hover)\b/, "p-nom-domaine"],
  [/\b(vercel|github|netlify|digitalocean|hetzner|openai|anthropic)\b/, "p-projets-web"],
  [/\b(rona|home depot|reno depot|bmr|patrick morin)\b/, "p-renovations"],
  [/\b(loyer|rent|hydro quebec|hydro)\b/, "p-logement"],
  [/\b(universite|cegep|udem|ulaval|uqam|mcgill|concordia|frais de scolarite)\b/, "p-education"],
  [/\b(airbnb|expedia|air canada|westjet|porter|hotel|booking com)\b/, "p-vacances"],
  [/\b(tfsa|celi|rrsp|reer|fhsa|celiapp|invest|placement|crypto)\b/, "p-epargne"],
];
const INCOME_RULES: [RegExp, string][] = [
  [/\b(interest|interet|interets)\b/, "p-interets"],
  [/\b(payroll|paie|salaire|salary|direct deposit|depot direct)\b/, "p-salaire"],
  [/\b(refund|remboursement|reimbursement|cashback|cash back)\b/, "p-remboursements"],
  [/\b(bourse|scholarship|afe|aide financiere)\b/, "p-bourses"],
];

export function guessCategory(direction: "depense" | "revenu", text: string): string {
  const key = fold(text);
  const rules = direction === "revenu" ? INCOME_RULES : EXPENSE_RULES;
  for (const [re, id] of rules) if (re.test(key)) return id;
  return direction === "revenu" ? "p-autres-revenus" : "p-autres";
}

/** Heuristic: is this a CSV export rather than an .xlsx? */
export function looksLikeCsv(name: string, type: string) {
  return /\.csv$/i.test(name) || /text\/(csv|plain)|application\/vnd\.ms-excel/.test(type);
}

export function parseBankCsv(text: string, sheet = "CSV"): ParsedBankCsv {
  const out: ParsedBankCsv = { invoices: [], skipped: [], otherAccounts: [] };
  const rows = parseCsv(text);
  // The header is the first row with a date column in it (some banks put a
  // title line or the account number above).
  const headAt = rows.findIndex((r) => findCol(r.map(fold), HEADERS.date) >= 0);
  if (headAt < 0) {
    out.skipped.push({ sheet, row: 0, reason: "En-têtes introuvables" });
    return out;
  }
  const head = rows[headAt].map(fold);
  const c = Object.fromEntries(
    Object.entries(HEADERS).map(([k, names]) => [k, findCol(head, names)])
  ) as Record<keyof typeof HEADERS, number>;
  const nameCols = NAME_HEADERS.map((n) => head.indexOf(n)).filter((i) => i >= 0);
  if (c.amount < 0 && c.debit < 0 && c.credit < 0) {
    out.skipped.push({ sheet, row: headAt + 1, reason: "Colonne montant introuvable" });
    return out;
  }

  const body = rows.slice(headAt + 1);
  // One file can hold every account: keep the chequing one when there is one.
  const accountOf = (r: string[]) => (c.account >= 0 ? (r[c.account] ?? "").trim() : "");
  const accounts = [...new Set(body.map(accountOf).filter(Boolean))];
  const keep = accounts.filter((a) => CHEQUING.test(fold(a)));
  const keepSet = new Set(keep.length ? keep : accounts);
  out.otherAccounts = accounts.filter((a) => !keepSet.has(a));

  body.forEach((r, i) => {
    const line = headAt + i + 2;
    const cell = (k: keyof typeof HEADERS) => (c[k] >= 0 ? (r[c[k]] ?? "").trim() : "");
    const account = accountOf(r);
    if (account && !keepSet.has(account)) return;

    const date = toYmd(cell("date"));
    if (!date) {
      out.skipped.push({ sheet, row: line, reason: "Date illisible" });
      return;
    }
    let cents: number | null;
    if (c.amount >= 0) cents = toCents(cell("amount"));
    else {
      const debit = toCents(cell("debit")) ?? 0;
      const credit = toCents(cell("credit")) ?? 0;
      cents = credit - Math.abs(debit);
    }
    if (cents === null) {
      out.skipped.push({ sheet, row: line, reason: "Montant illisible" });
      return;
    }
    // An unsigned amount with a separate direction column.
    const dir = fold(cell("direction"));
    if (cents > 0 && /^(out|debit|withdrawal|sortie)/.test(dir)) cents = -cents;
    if (cents === 0) return;

    const currency = cell("currency").toUpperCase();
    const name =
      nameCols
        .map((i) => (r[i] ?? "").trim())
        .find(Boolean)
        // "Retrait (au 2026-08-12)": the date is already on the row.
        ?.replace(/\s*\(au \d{4}-\d{2}-\d{2}\)$/, "") ?? "";
    const subType = cell("subType").replace(/^-$/, "");
    const type = [cell("type"), subType].filter(Boolean).join(" · ");
    const direction = cents < 0 ? "depense" : "revenu";
    const total = Math.abs(cents);
    out.invoices.push({
      direction,
      date,
      party: name || type || null,
      number: null,
      // Wealthsimple's type codes (MoneyMovement · SPEND) say nothing more
      // than the name already does.
      description: null,
      category:
        categoryFromSubType(direction, subType, cell("type")) ??
        guessCategory(direction, `${name} ${type}`),
      subtotalCents: total,
      gstCents: 0,
      qstCents: 0,
      totalCents: total,
      notes: currency && currency !== "CAD" ? `Montant en ${currency}` : null,
      paidBy: null,
      row: line,
    });
  });
  return out;
}
