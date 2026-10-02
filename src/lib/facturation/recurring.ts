import type { Prisma, RecurringInvoice } from "@prisma/client";

import { type Frequency, type InvoiceLang, type InvoiceLine, isoDay, readLines, runAtFor } from "./meta";
import type { RecurringInputT } from "./schemas";

export interface RecurringView {
  id: string;
  organisationId: string;
  contactId: string | null;
  title: string;
  party: string;
  billTo: string | null;
  clientEmail: string | null;
  cc: string | null;
  lines: InvoiceLine[];
  applyTaxes: boolean;
  lang: InvoiceLang;
  notes: string | null;
  frequency: Frequency;
  interval: number;
  dueDays: number;
  nextRunDate: string;
  endDate: string | null;
  autoSend: boolean;
  mailAccountId: string | null;
  active: boolean;
  lastInvoiceId: string | null;
  lastRunAt: string | null;
  lastError: string | null;
}

export function recurringView(r: RecurringInvoice): RecurringView {
  return {
    id: r.id,
    organisationId: r.organisationId,
    contactId: r.contactId,
    title: r.title,
    party: r.party,
    billTo: r.billTo,
    clientEmail: r.clientEmail,
    cc: r.cc,
    lines: readLines(r.lines),
    applyTaxes: r.applyTaxes,
    lang: r.lang === "en" ? "en" : "fr",
    notes: r.notes,
    frequency: r.frequency as Frequency,
    interval: r.interval,
    dueDays: r.dueDays,
    nextRunDate: isoDay(r.nextRunAt),
    endDate: r.endDate ? isoDay(r.endDate) : null,
    autoSend: r.autoSend,
    mailAccountId: r.mailAccountId,
    active: r.active,
    lastInvoiceId: r.lastInvoiceId,
    lastRunAt: r.lastRunAt?.toISOString() ?? null,
    lastError: r.lastError,
  };
}

/** Columns shared by create and update. */
export function recurringData(d: RecurringInputT) {
  return {
    organisationId: d.organisationId,
    contactId: d.contactId,
    title: d.title,
    party: d.party,
    billTo: d.billTo,
    clientEmail: d.clientEmail,
    cc: d.cc,
    lines: d.lines as unknown as Prisma.InputJsonValue,
    applyTaxes: d.applyTaxes,
    lang: d.lang,
    notes: d.notes,
    frequency: d.frequency,
    interval: d.interval,
    dueDays: d.dueDays,
    nextRunAt: runAtFor(d.nextRunDate),
    endDate: d.endDate ? new Date(`${d.endDate}T23:59:59Z`) : null,
    autoSend: d.autoSend,
    mailAccountId: d.mailAccountId,
    ...(d.active != null ? { active: d.active } : {}),
  };
}
