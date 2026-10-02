/**
 * Facturation, server side: save an issued invoice (and its PDF), send it by
 * email, and run the recurring contracts that are due.
 */
import type { Prisma } from "@prisma/client";

import { logger } from "@/lib/logger";
import { loadAccount } from "@/lib/mail/account";
import { sendMail } from "@/lib/mail/smtp";
import { notify } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";

import {
  DEFAULT_EMAIL,
  type Frequency,
  type InvoiceLang,
  type InvoiceLine,
  type InvoiceStatus,
  addDays,
  addPeriod,
  computeTotals,
  fillTemplate,
  formatCents,
  formatIsoDay,
  isoDay,
  nextInvoiceNumber,
  readLines,
} from "./meta";
import { renderInvoicePdf } from "./pdf";

const LOG_SOURCE = "facturation";

/** Columns the Facturation page works with (no file bytes). */
export const issuedSelect = {
  id: true,
  organisationId: true,
  direction: true,
  date: true,
  party: true,
  number: true,
  description: true,
  subtotalCents: true,
  gstCents: true,
  qstCents: true,
  totalCents: true,
  notes: true,
  contactId: true,
  status: true,
  dueDate: true,
  billTo: true,
  clientEmail: true,
  lines: true,
  applyTaxes: true,
  lang: true,
  sentAt: true,
  sentTo: true,
  paidAt: true,
  recurringId: true,
  createdAt: true,
  file: { select: { name: true, mime: true, size: true } },
} satisfies Prisma.InvoiceSelect;

type IssuedRow = Prisma.InvoiceGetPayload<{ select: typeof issuedSelect }>;

export interface IssuedView {
  id: string;
  organisationId: string;
  date: string;
  party: string | null;
  number: string | null;
  description: string | null;
  subtotalCents: number;
  gstCents: number;
  qstCents: number;
  totalCents: number;
  notes: string | null;
  contactId: string | null;
  status: string | null;
  dueDate: string | null;
  billTo: string | null;
  clientEmail: string | null;
  lines: InvoiceLine[];
  generated: boolean;
  applyTaxes: boolean;
  lang: InvoiceLang;
  sentAt: string | null;
  sentTo: string | null;
  paidAt: string | null;
  recurringId: string | null;
  hasFile: boolean;
  createdAt: string;
}

export function toIssuedView(row: IssuedRow): IssuedView {
  const lines = readLines(row.lines);
  return {
    id: row.id,
    organisationId: row.organisationId,
    date: isoDay(row.date),
    party: row.party,
    number: row.number,
    description: row.description,
    subtotalCents: row.subtotalCents,
    gstCents: row.gstCents,
    qstCents: row.qstCents,
    totalCents: row.totalCents,
    notes: row.notes,
    contactId: row.contactId,
    status: row.status,
    dueDate: row.dueDate ? isoDay(row.dueDate) : null,
    billTo: row.billTo,
    clientEmail: row.clientEmail,
    lines,
    generated: row.lines != null,
    applyTaxes: row.applyTaxes,
    lang: row.lang === "en" ? "en" : "fr",
    sentAt: row.sentAt?.toISOString() ?? null,
    sentTo: row.sentTo,
    paidAt: row.paidAt?.toISOString() ?? null,
    recurringId: row.recurringId,
    hasFile: !!row.file,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function settingsFor(organisationId: string) {
  return (
    (await prisma.invoicingSettings.findUnique({ where: { organisationId } })) ?? {
      organisationId,
      numberPrefix: null,
      dueDays: 30,
      lang: "fr",
      notes: null,
      mailAccountId: null,
      emailSubject: null,
      emailBody: null,
      updatedAt: new Date(),
    }
  );
}

export async function nextNumberFor(organisationId: string): Promise<string> {
  const [settings, rows] = await Promise.all([
    settingsFor(organisationId),
    prisma.invoice.findMany({
      where: { organisationId, direction: "revenu", number: { not: null } },
      select: { number: true },
    }),
  ]);
  return nextInvoiceNumber(
    rows.map((r) => r.number),
    settings.numberPrefix
  );
}

/** The issuer block printed on the PDF, from the company's tax profile. */
export async function issuerFor(organisationId: string) {
  const org = await prisma.organisation.findUnique({
    where: { id: organisationId },
    select: { name: true, image: true, color: true, taxProfile: true },
  });
  if (!org) throw new Error("Organisation introuvable");
  const p = org.taxProfile;
  const cityLine = [p?.city, p?.province, p?.postalCode].filter(Boolean).join(" ");
  return {
    registered: p?.salesTaxStatus === "inscrit",
    issuer: {
      name: p?.legalName || org.name,
      details: [p?.address, cityLine, p?.email, p?.phone, p?.website].filter(
        (s): s is string => !!s && !!s.trim()
      ),
      gstNumber: p?.gstNumber,
      qstNumber: p?.qstNumber,
      neq: p?.neq,
      logo: org.image,
      color: org.color,
    },
    companyName: org.name,
  };
}

export interface IssueInput {
  organisationId: string;
  contactId?: string | null;
  party: string;
  billTo?: string | null;
  clientEmail?: string | null;
  number?: string | null;
  date: string; // YYYY-MM-DD
  dueDate?: string | null;
  title?: string | null;
  lines: InvoiceLine[];
  applyTaxes: boolean;
  lang: InvoiceLang;
  notes?: string | null;
  status?: InvoiceStatus;
  recurringId?: string | null;
}

/**
 * Create (or, with `id`, replace) an invoice made here: totals from the
 * lines, a number when none is given, and the PDF stored as its file so it
 * also shows up in Fiscalité.
 */
export async function saveIssuedInvoice(input: IssueInput, id?: string): Promise<IssuedView> {
  const { issuer } = await issuerFor(input.organisationId);
  const totals = computeTotals(input.lines, input.applyTaxes);
  const number = input.number?.trim() || (await nextNumberFor(input.organisationId));
  const pdf = await renderInvoicePdf({
    lang: input.lang,
    number,
    date: input.date,
    dueDate: input.dueDate ?? null,
    issuer,
    client: { name: input.party, billTo: input.billTo, email: input.clientEmail },
    title: input.title,
    lines: input.lines,
    totals,
    applyTaxes: input.applyTaxes,
    notes: input.notes,
  });
  const fileName = `${input.lang === "en" ? "invoice" : "facture"}-${number.replace(/[^\w.-]+/g, "_")}.pdf`;
  const file = { name: fileName, mime: "application/pdf", size: pdf.byteLength, data: Buffer.from(pdf), text: null };

  const data = {
    organisationId: input.organisationId,
    direction: "revenu",
    date: new Date(`${input.date}T00:00:00Z`),
    party: input.party,
    number,
    description: input.title || input.lines[0]?.description || null,
    category: "services",
    ...totals,
    notes: input.notes || null,
    contactId: input.contactId || null,
    billTo: input.billTo || null,
    clientEmail: input.clientEmail || null,
    dueDate: input.dueDate ? new Date(`${input.dueDate}T00:00:00Z`) : null,
    lines: input.lines as unknown as Prisma.InputJsonValue,
    applyTaxes: input.applyTaxes,
    lang: input.lang,
    recurringId: input.recurringId || null,
  };

  const row = id
    ? await prisma.invoice.update({
        where: { id },
        data: {
          ...data,
          ...(input.status ? { status: input.status } : {}),
          file: { upsert: { create: file, update: file } },
        },
        select: issuedSelect,
      })
    : await prisma.invoice.create({
        data: { ...data, status: input.status ?? "draft", file: { create: file } },
        select: issuedSelect,
      });
  return toIssuedView(row);
}

export interface SendInput {
  mailAccountId: string;
  to: string;
  cc?: string | null;
  subject?: string | null;
  body?: string | null;
}

/** Email values for the subject / body templates. */
export async function templateValues(inv: IssuedView) {
  const org = await prisma.organisation.findUnique({
    where: { id: inv.organisationId },
    select: { name: true, taxProfile: { select: { legalName: true } } },
  });
  return {
    number: inv.number ?? "",
    client: inv.party ?? "",
    total: formatCents(inv.totalCents, inv.lang),
    date: formatIsoDay(inv.date, inv.lang),
    dueDate: inv.dueDate ? formatIsoDay(inv.dueDate, inv.lang) : "",
    company: org?.taxProfile?.legalName || org?.name || "",
  };
}

/** Send the invoice's PDF from one of the user's mail accounts, then mark it sent. */
export async function sendIssuedInvoice(userId: string, invoiceId: string, input: SendInput): Promise<IssuedView> {
  const row = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { ...issuedSelect, file: { select: { name: true, mime: true, size: true, data: true } } },
  });
  if (!row) throw new Error("Facture introuvable");
  if (!row.file) throw new Error("Cette facture n'a pas de PDF");
  const account = await loadAccount(userId, input.mailAccountId);
  if (!account) throw new Error("Compte courriel introuvable");

  const view = toIssuedView(row);
  const settings = await settingsFor(row.organisationId);
  const values = await templateValues(view);
  const fallback = DEFAULT_EMAIL[view.lang];
  const subject = fillTemplate(input.subject || settings.emailSubject || fallback.subject, values);
  const body = fillTemplate(input.body || settings.emailBody || fallback.body, values);

  await sendMail(account.smtp, {
    to: input.to,
    cc: input.cc || undefined,
    subject,
    text: body,
    attachments: [{ filename: row.file.name, content: Buffer.from(row.file.data), contentType: row.file.mime }],
  });

  const [updated] = await prisma.$transaction([
    prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        status: row.status === "paid" ? "paid" : "sent",
        sentAt: new Date(),
        sentTo: [input.to, input.cc].filter(Boolean).join(", "),
        clientEmail: row.clientEmail || input.to,
      },
      select: issuedSelect,
    }),
    // Remember the account for next time.
    prisma.invoicingSettings.upsert({
      where: { organisationId: row.organisationId },
      create: { organisationId: row.organisationId, mailAccountId: input.mailAccountId },
      update: { mailAccountId: input.mailAccountId },
    }),
  ]);
  return toIssuedView(updated);
}

type RecurringRow = Prisma.RecurringInvoiceGetPayload<object>;

/**
 * Issue one recurring invoice now (date = its scheduled day), send it when
 * autoSend is on, and record the outcome. Doesn't move `nextRunAt`.
 */
export async function issueFromRecurring(rec: RecurringRow, issueDay: string) {
  const invoice = await saveIssuedInvoice({
    organisationId: rec.organisationId,
    contactId: rec.contactId,
    party: rec.party,
    billTo: rec.billTo,
    clientEmail: rec.clientEmail,
    date: issueDay,
    dueDate: isoDay(addDays(new Date(`${issueDay}T00:00:00Z`), rec.dueDays)),
    title: rec.title,
    lines: readLines(rec.lines),
    applyTaxes: rec.applyTaxes,
    lang: rec.lang === "en" ? "en" : "fr",
    notes: rec.notes,
    status: "draft",
    recurringId: rec.id,
  });

  let sent: IssuedView | null = null;
  let error: string | null = null;
  if (rec.autoSend) {
    if (!rec.clientEmail || !rec.mailAccountId) {
      error = "Pas de courriel client ou de compte d'envoi : facture créée en brouillon.";
    } else {
      try {
        sent = await sendIssuedInvoice(rec.userId, invoice.id, {
          mailAccountId: rec.mailAccountId,
          to: rec.clientEmail,
          cc: rec.cc,
        });
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
      }
    }
  }

  await prisma.recurringInvoice.update({
    where: { id: rec.id },
    data: { lastInvoiceId: invoice.id, lastRunAt: new Date(), lastError: error },
  });
  return { invoice: sent ?? invoice, sent: !!sent, error };
}

/**
 * Called by the notifications cron: every active contract whose `nextRunAt`
 * passed gets its invoice. The date is claimed first (compare-and-set), so two
 * overlapping runs can't issue it twice; missed periods are skipped, not
 * back-filled, so a paused contract doesn't spam the client when resumed.
 */
export async function runDueRecurring(now = new Date()) {
  const due = await prisma.recurringInvoice.findMany({
    where: { active: true, nextRunAt: { lte: now } },
    take: 50,
  });
  let issued = 0;
  for (const rec of due) {
    const freq = rec.frequency as Frequency;
    let next = addPeriod(rec.nextRunAt, freq, rec.interval);
    while (next <= now) next = addPeriod(next, freq, rec.interval);
    const ended = rec.endDate != null && next > rec.endDate;
    const claimed = await prisma.recurringInvoice.updateMany({
      where: { id: rec.id, nextRunAt: rec.nextRunAt, active: true },
      data: { nextRunAt: next, ...(ended ? { active: false } : {}) },
    });
    if (claimed.count === 0) continue;

    try {
      const { invoice, sent, error } = await issueFromRecurring(rec, isoDay(rec.nextRunAt));
      issued++;
      await notify(rec.userId, {
        kind: error ? "invoice_failed" : "invoice_issued",
        source: "facturation",
        important: true,
        title: sent
          ? `Facture ${invoice.number} envoyée à ${rec.party}`
          : `Facture ${invoice.number} prête pour ${rec.party}`,
        body: error ?? `${rec.title} · ${formatCents(invoice.totalCents, invoice.lang)}`,
        url: "/facturation",
        dedupeKey: `recurring:${rec.id}:${isoDay(rec.nextRunAt)}`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await prisma.recurringInvoice.update({ where: { id: rec.id }, data: { lastError: message } });
      logger.error("Recurring invoice failed", { id: rec.id, error: message }, LOG_SOURCE);
      await notify(rec.userId, {
        kind: "invoice_failed",
        source: "facturation",
        important: true,
        title: `Facture récurrente échouée · ${rec.party}`,
        body: message,
        url: "/facturation",
        dedupeKey: `recurring-failed:${rec.id}:${isoDay(rec.nextRunAt)}`,
      });
    }
  }
  return { due: due.length, issued };
}
