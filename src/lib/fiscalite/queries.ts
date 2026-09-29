import type { Prisma } from "@prisma/client";

import type { InvoiceLite } from "./meta";

/** Invoice columns for lists: everything but the file bytes. */
export const invoiceSelect = {
  id: true,
  organisationId: true,
  direction: true,
  date: true,
  party: true,
  partyTaxNumber: true,
  number: true,
  description: true,
  category: true,
  subtotalCents: true,
  gstCents: true,
  qstCents: true,
  totalCents: true,
  notes: true,
  paidBy: true,
  createdAt: true,
  file: { select: { name: true, mime: true, size: true } },
} satisfies Prisma.InvoiceSelect;

type InvoiceRow = Prisma.InvoiceGetPayload<{ select: typeof invoiceSelect }>;

export type InvoiceView = Omit<InvoiceRow, "date" | "createdAt"> &
  InvoiceLite & { date: string; createdAt: string };

/** Serializable shape the client works with (date as YYYY-MM-DD). */
export function toInvoiceView(row: InvoiceRow): InvoiceView {
  return {
    ...row,
    date: row.date.toISOString().slice(0, 10),
    createdAt: row.createdAt.toISOString(),
    hasFile: !!row.file,
  };
}

export const movementSelect = {
  id: true,
  organisationId: true,
  date: true,
  kind: true,
  partner: true,
  amountCents: true,
  account: true,
  notes: true,
} satisfies Prisma.PartnerMovementSelect;

type MovementRow = Prisma.PartnerMovementGetPayload<{ select: typeof movementSelect }>;
export type MovementView = Omit<MovementRow, "date"> & { date: string };

export function toMovementView(row: MovementRow): MovementView {
  return { ...row, date: row.date.toISOString().slice(0, 10) };
}
