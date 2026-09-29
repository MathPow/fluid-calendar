/**
 * Merge a parsed workbook into what's already filed: which rows are new, which
 * update an existing invoice, which are identical. Nothing is ever deleted —
 * an invoice missing from the sheet stays (it may have been dropped as a PDF
 * after the export).
 */
import type { ParsedInvoice, ParsedMovement } from "./excel";

export interface ExistingInvoice {
  id: string;
  direction: string;
  date: string;
  party: string | null;
  number: string | null;
  description: string | null;
  category: string | null;
  subtotalCents: number;
  gstCents: number;
  qstCents: number;
  totalCents: number;
  notes: string | null;
  paidBy: string | null;
}

export interface ExistingMovement {
  date: string;
  kind: string;
  partner: string;
  amountCents: number;
}

const FIELDS = [
  "date",
  "party",
  "number",
  "description",
  "category",
  "subtotalCents",
  "gstCents",
  "qstCents",
  "totalCents",
  "notes",
  "paidBy",
] as const;
type Field = (typeof FIELDS)[number];

const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/\s+/g, " ").trim();

export interface InvoicePlan {
  create: ParsedInvoice[];
  update: { id: string; row: ParsedInvoice; changes: Partial<Record<Field, unknown>> }[];
  same: number;
}

export function planInvoices(parsed: ParsedInvoice[], existing: ExistingInvoice[]): InvoicePlan {
  const plan: InvoicePlan = { create: [], update: [], same: 0 };
  const pool = [...existing];
  for (const row of parsed) {
    const sameDir = (e: ExistingInvoice) => e.direction === row.direction;
    // 1. Same invoice number. 2. Same day, amount and party. 3. Same day and amount.
    const idx = [
      (e: ExistingInvoice) => !!row.number && !!e.number && norm(e.number) === norm(row.number),
      (e: ExistingInvoice) =>
        e.date === row.date && e.totalCents === row.totalCents && norm(e.party) === norm(row.party ?? e.party),
      (e: ExistingInvoice) => e.date === row.date && e.totalCents === row.totalCents,
    ]
      .map((test) => pool.findIndex((e) => sameDir(e) && test(e)))
      .find((i) => i >= 0);
    if (idx === undefined) {
      plan.create.push(row);
      continue;
    }
    const match = pool.splice(idx, 1)[0];
    const changes: Partial<Record<Field, unknown>> = {};
    for (const f of FIELDS) {
      const v = row[f];
      if (v === undefined) continue; // column absent from the sheet
      if ((match[f] ?? null) !== (v ?? null)) changes[f] = v;
    }
    if (Object.keys(changes).length) plan.update.push({ id: match.id, row, changes });
    else plan.same++;
  }
  return plan;
}

export function planMovements(parsed: ParsedMovement[], existing: ExistingMovement[]) {
  const pool = [...existing];
  const create: ParsedMovement[] = [];
  let same = 0;
  for (const m of parsed) {
    const i = pool.findIndex(
      (e) =>
        e.date === m.date && e.kind === m.kind && e.amountCents === m.amountCents && norm(e.partner) === norm(m.partner)
    );
    if (i >= 0) {
      pool.splice(i, 1);
      same++;
    } else create.push(m);
  }
  return { create, same };
}
