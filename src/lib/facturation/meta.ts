/**
 * Facturation: invoices issued to clients, one-off or recurring. Pure helpers
 * shared by the API, the cron and the UI (no Prisma, no Node APIs).
 */

export const GST_RATE = 0.05;
export const QST_RATE = 0.09975;

export type InvoiceLang = "fr" | "en";
export type InvoiceStatus = "draft" | "sent" | "paid";
export type Frequency = "weekly" | "monthly" | "quarterly" | "yearly";
export const FREQUENCIES: Frequency[] = ["weekly", "monthly", "quarterly", "yearly"];

export interface InvoiceLine {
  description: string;
  quantity: number;
  unitCents: number;
}

export interface Totals {
  subtotalCents: number;
  gstCents: number;
  qstCents: number;
  totalCents: number;
}

export function lineCents(line: InvoiceLine): number {
  return Math.round(line.quantity * line.unitCents);
}

/** Subtotal of the lines, then TPS 5 % and TVQ 9,975 % on it when taxes apply. */
export function computeTotals(lines: InvoiceLine[], applyTaxes: boolean): Totals {
  const subtotalCents = lines.reduce((sum, l) => sum + lineCents(l), 0);
  const gstCents = applyTaxes ? Math.round(subtotalCents * GST_RATE) : 0;
  const qstCents = applyTaxes ? Math.round(subtotalCents * QST_RATE) : 0;
  return { subtotalCents, gstCents, qstCents, totalCents: subtotalCents + gstCents + qstCents };
}

/**
 * The number that follows the existing ones. With a prefix, the highest
 * number using it plus one ("F-2026-" → "F-2026-004"). Without, it keeps the
 * shape of the highest numbered invoice ("INV-0041" → "INV-0042", "17" → "18"),
 * so imported invoices carry the sequence on.
 */
export function nextInvoiceNumber(existing: (string | null | undefined)[], prefix?: string | null): string {
  const parsed = existing
    .map((n) => n?.trim())
    .filter((n): n is string => !!n)
    .map((n) => {
      const m = n.match(/^(.*?)(\d+)(\D*)$/);
      return m ? { head: m[1], digits: m[2], tail: m[3], value: Number(m[2]) } : null;
    })
    .filter((p): p is NonNullable<typeof p> => !!p);

  if (prefix) {
    const same = parsed.filter((p) => p.head === prefix && !p.tail);
    const top = same.reduce((max, p) => Math.max(max, p.value), 0);
    const width = Math.max(3, ...same.map((p) => p.digits.length));
    return `${prefix}${String(top + 1).padStart(width, "0")}`;
  }
  if (parsed.length === 0) return "1";
  const top = parsed.reduce((best, p) => (p.value > best.value ? p : best));
  return `${top.head}${String(top.value + 1).padStart(top.digits.length, "0")}${top.tail}`;
}

/** Add whole periods to a date, in UTC, clamping the day (Jan 31 + 1 month → Feb 28). */
export function addPeriod(date: Date, frequency: Frequency, interval = 1): Date {
  const d = new Date(date.getTime());
  if (frequency === "weekly") {
    d.setUTCDate(d.getUTCDate() + 7 * interval);
    return d;
  }
  const months = (frequency === "monthly" ? 1 : frequency === "quarterly" ? 3 : 12) * interval;
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d;
}

/** Recurring invoices fire at 13:00 UTC (9 h in Québec in summer, 8 h in winter). */
export const RUN_HOUR_UTC = 13;

export function runAtFor(isoDay: string): Date {
  return new Date(`${isoDay}T${String(RUN_HOUR_UTC).padStart(2, "0")}:00:00Z`);
}

export function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

/** "Bonjour {client}" → "Bonjour Acme". Unknown placeholders stay as is. */
export function fillTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (m, k) => (k in values ? values[k] : m));
}

export const DEFAULT_EMAIL: Record<InvoiceLang, { subject: string; body: string }> = {
  fr: {
    subject: "Facture {number} · {company}",
    body:
      "Bonjour {client},\n\nVoici la facture {number} de {total}, payable d'ici le {dueDate}. Elle est jointe en PDF.\n\nMerci!\n{company}",
  },
  en: {
    subject: "Invoice {number} · {company}",
    body:
      "Hi {client},\n\nHere is invoice {number} for {total}, due by {dueDate}. The PDF is attached.\n\nThanks!\n{company}",
  },
};

export function formatCents(cents: number, lang: InvoiceLang): string {
  return new Intl.NumberFormat(lang === "en" ? "en-CA" : "fr-CA", {
    style: "currency",
    currency: "CAD",
  }).format(cents / 100);
}

export function formatIsoDay(day: string | Date, lang: InvoiceLang): string {
  const d = typeof day === "string" ? new Date(`${day.slice(0, 10)}T00:00:00Z`) : day;
  return new Intl.DateTimeFormat(lang === "en" ? "en-CA" : "fr-CA", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
}

/** Display status: a sent invoice past its due date is overdue. */
export function displayStatus(
  inv: { status: string | null; dueDate: string | null },
  today: string
): "draft" | "sent" | "paid" | "overdue" | "imported" {
  if (inv.status === "paid") return "paid";
  if (inv.status === "draft") return "draft";
  if (inv.status === "sent") return inv.dueDate && inv.dueDate < today ? "overdue" : "sent";
  return "imported";
}

/** Parse the `lines` JSON column defensively. */
export function readLines(value: unknown): InvoiceLine[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((l) => ({
      description: typeof l?.description === "string" ? l.description : "",
      quantity: Number(l?.quantity) || 0,
      unitCents: Math.round(Number(l?.unitCents) || 0),
    }))
    .filter((l) => l.description || l.unitCents);
}
