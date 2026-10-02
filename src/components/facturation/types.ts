import type { InvoiceLang } from "@/lib/facturation/meta";

export type { IssuedView } from "@/lib/facturation/service";
export type { RecurringView } from "@/lib/facturation/recurring";

export interface FactOrg {
  id: string;
  name: string;
  color: string | null;
  image: string | null;
  legalName: string | null;
  registered: boolean;
}

export interface FactContact {
  id: string;
  name: string;
  email: string | null;
  company: string | null;
  type: string;
}

export interface FactSettings {
  numberPrefix: string | null;
  dueDays: number;
  lang: InvoiceLang;
  notes: string | null;
  mailAccountId: string | null;
  emailSubject: string | null;
  emailBody: string | null;
  nextNumber: string;
}

export interface MailAccountLite {
  id: string;
  email: string;
  displayName: string | null;
}

/** "250" / "250,00" / "1 234.5" → cents; null when unreadable. */
export function moneyInputToCents(raw: string): number | null {
  const s = raw.replace(/[\s  $]/g, "").replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

export function centsToMoneyInput(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function plusDaysIso(day: string, days: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Open a PDF blob in a new tab (falls back to a download when popups are blocked). */
export function openBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank", "noopener");
  if (!win) {
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
