/**
 * Render an issued invoice as a one-or-more page Letter PDF (pdf-lib,
 * standard Helvetica — no font files to ship).
 */
import { PDFDocument, type PDFFont, type PDFImage, type PDFPage, StandardFonts, rgb } from "pdf-lib";

import {
  type InvoiceLang,
  type InvoiceLine,
  type Totals,
  formatCents,
  formatIsoDay,
  lineCents,
} from "./meta";

export interface InvoicePdfInput {
  lang: InvoiceLang;
  number: string;
  date: string; // YYYY-MM-DD
  dueDate: string | null;
  issuer: {
    name: string;
    details: string[]; // address lines, email, phone, website
    gstNumber?: string | null;
    qstNumber?: string | null;
    neq?: string | null;
    logo?: string | null; // data URL (png / jpeg)
    color?: string | null; // hex accent
  };
  client: { name: string; billTo?: string | null; email?: string | null };
  title?: string | null; // e.g. the contract name
  lines: InvoiceLine[];
  totals: Totals;
  applyTaxes: boolean;
  notes?: string | null;
}

const L = {
  fr: {
    invoice: "FACTURE",
    number: "No",
    date: "Date",
    due: "Échéance",
    billTo: "Facturé à",
    description: "Description",
    qty: "Qté",
    unit: "Prix unitaire",
    amount: "Montant",
    subtotal: "Sous-total",
    gst: "TPS (5 %)",
    qst: "TVQ (9,975 %)",
    total: "Total",
    gstNo: "No TPS",
    qstNo: "No TVQ",
    neq: "NEQ",
    noTaxes: "Petit fournisseur : aucune TPS/TVQ facturée.",
    page: "Page",
  },
  en: {
    invoice: "INVOICE",
    number: "No.",
    date: "Date",
    due: "Due",
    billTo: "Bill to",
    description: "Description",
    qty: "Qty",
    unit: "Unit price",
    amount: "Amount",
    subtotal: "Subtotal",
    gst: "GST (5%)",
    qst: "QST (9.975%)",
    total: "Total",
    gstNo: "GST no.",
    qstNo: "QST no.",
    neq: "NEQ",
    noTaxes: "Small supplier: no GST/QST charged.",
    page: "Page",
  },
} as const;

// Characters Helvetica (WinAnsi) can draw beyond Latin-1.
const WIN_ANSI_EXTRA = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";

/** Replace what the standard font can't encode, so drawText never throws. */
export function pdfSafe(text: string): string {
  return text
    .replace(/[   ]/g, " ")
    .replace(/[\t]/g, " ")
    .replace(/[^\n -~ -ÿ]/g, (c) => (WIN_ANSI_EXTRA.includes(c) ? c : "?"));
}

function hexColor(hex: string | null | undefined) {
  const m = hex?.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return rgb(0.1, 0.1, 0.11);
  return rgb(parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255);
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  for (const para of pdfSafe(text).split("\n")) {
    let line = "";
    for (const word of para.split(/ +/)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= width) {
        line = next;
        continue;
      }
      if (line) out.push(line);
      // A single word wider than the column: hard-break it.
      let rest = word;
      while (font.widthOfTextAtSize(rest, size) > width && rest.length > 1) {
        let cut = rest.length - 1;
        while (cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), size) > width) cut--;
        out.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      line = rest;
    }
    out.push(line);
  }
  return out;
}

async function embedLogo(doc: PDFDocument, dataUrl: string | null | undefined): Promise<PDFImage | null> {
  const m = dataUrl?.match(/^data:image\/(png|jpe?g);base64,(.+)$/);
  if (!m) return null;
  try {
    const bytes = Buffer.from(m[2], "base64");
    return m[1] === "png" ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
  } catch {
    return null;
  }
}

export async function renderInvoicePdf(input: InvoicePdfInput): Promise<Uint8Array> {
  const t = L[input.lang] ?? L.fr;
  const money = (c: number) => pdfSafe(formatCents(c, input.lang));
  const day = (d: string) => pdfSafe(formatIsoDay(d, input.lang));

  const doc = await PDFDocument.create();
  doc.setTitle(`${t.invoice} ${input.number}`);
  doc.setAuthor(input.issuer.name);
  doc.setCreator("DreamDash");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const logo = await embedLogo(doc, input.issuer.logo);

  const W = 612;
  const H = 792;
  const M = 50;
  const ink = rgb(0.1, 0.1, 0.11);
  const muted = rgb(0.42, 0.42, 0.45);
  const rule = rgb(0.86, 0.86, 0.88);
  const accent = hexColor(input.issuer.color);

  const pages: PDFPage[] = [];
  let page = doc.addPage([W, H]);
  pages.push(page);
  let y = H - M;

  const text = (s: string, x: number, yy: number, opts: { size?: number; f?: PDFFont; color?: ReturnType<typeof rgb> } = {}) =>
    page.drawText(pdfSafe(s), { x, y: yy, size: opts.size ?? 10, font: opts.f ?? font, color: opts.color ?? ink });
  const right = (s: string, xr: number, yy: number, opts: { size?: number; f?: PDFFont; color?: ReturnType<typeof rgb> } = {}) => {
    const f = opts.f ?? font;
    const size = opts.size ?? 10;
    text(s, xr - f.widthOfTextAtSize(pdfSafe(s), size), yy, opts);
  };

  // Header: issuer on the left, title + meta on the right.
  page.drawRectangle({ x: 0, y: H - 8, width: W, height: 8, color: accent });
  let leftY = y;
  if (logo) {
    const scale = Math.min(48 / logo.height, 140 / logo.width);
    page.drawImage(logo, { x: M, y: leftY - logo.height * scale + 4, width: logo.width * scale, height: logo.height * scale });
    leftY -= logo.height * scale + 10;
  }
  text(input.issuer.name, M, leftY - 4, { size: 14, f: bold });
  leftY -= 20;
  const ids = [
    input.issuer.neq ? `${t.neq} ${input.issuer.neq}` : null,
    input.applyTaxes && input.issuer.gstNumber ? `${t.gstNo} ${input.issuer.gstNumber}` : null,
    input.applyTaxes && input.issuer.qstNumber ? `${t.qstNo} ${input.issuer.qstNumber}` : null,
  ].filter((s): s is string => !!s);
  for (const line of [...input.issuer.details, ...ids]) {
    for (const w of wrap(line, font, 9, 260)) {
      text(w, M, leftY, { size: 9, color: muted });
      leftY -= 12;
    }
  }

  const xr = W - M;
  right(t.invoice, xr, y - 10, { size: 24, f: bold, color: accent });
  let rightY = y - 34;
  const meta: [string, string][] = [
    [t.number, input.number],
    [t.date, day(input.date)],
    ...(input.dueDate ? ([[t.due, day(input.dueDate)]] as [string, string][]) : []),
  ];
  for (const [k, v] of meta) {
    right(v, xr, rightY, { size: 10, f: bold });
    right(k, xr - bold.widthOfTextAtSize(pdfSafe(v), 10) - 10, rightY, { size: 10, color: muted });
    rightY -= 15;
  }

  y = Math.min(leftY, rightY) - 18;

  // Bill to.
  text(t.billTo.toUpperCase(), M, y, { size: 8, f: bold, color: muted });
  y -= 14;
  text(input.client.name, M, y, { size: 11, f: bold });
  y -= 14;
  for (const line of [...(input.client.billTo ? input.client.billTo.split("\n") : []), input.client.email ?? ""]) {
    if (!line.trim()) continue;
    for (const w of wrap(line, font, 9.5, 300)) {
      text(w, M, y, { size: 9.5, color: muted });
      y -= 12.5;
    }
  }
  if (input.title) {
    y -= 6;
    for (const w of wrap(input.title, bold, 10.5, W - 2 * M)) {
      text(w, M, y, { size: 10.5, f: bold });
      y -= 14;
    }
  }
  y -= 14;

  // Lines table.
  const colQty = W - M - 200;
  const colUnit = W - M - 90;
  const descWidth = colQty - M - 40;
  const header = () => {
    page.drawRectangle({ x: M, y: y - 6, width: W - 2 * M, height: 20, color: rgb(0.95, 0.95, 0.96) });
    text(t.description, M + 8, y, { size: 8.5, f: bold, color: muted });
    right(t.qty, colQty, y, { size: 8.5, f: bold, color: muted });
    right(t.unit, colUnit, y, { size: 8.5, f: bold, color: muted });
    right(t.amount, xr - 8, y, { size: 8.5, f: bold, color: muted });
    y -= 24;
  };
  const newPage = () => {
    page = doc.addPage([W, H]);
    pages.push(page);
    y = H - M;
    header();
  };
  header();
  for (const line of input.lines) {
    const rows = wrap(line.description || "—", font, 10, descWidth);
    if (y - rows.length * 13 < 170) newPage();
    const top = y;
    rows.forEach((r, i) => text(r, M + 8, top - i * 13));
    const qty = Number.isInteger(line.quantity)
      ? String(line.quantity)
      : line.quantity.toLocaleString(input.lang === "en" ? "en-CA" : "fr-CA", { maximumFractionDigits: 2 });
    right(qty, colQty, top);
    right(money(line.unitCents), colUnit, top);
    right(money(lineCents(line)), xr - 8, top, { f: bold });
    y = top - rows.length * 13 - 6;
    page.drawLine({ start: { x: M, y: y + 2 }, end: { x: xr, y: y + 2 }, thickness: 0.5, color: rule });
    y -= 10;
  }

  // Totals.
  if (y < 150) newPage();
  y -= 4;
  const totalRows: [string, number][] = [[t.subtotal, input.totals.subtotalCents]];
  if (input.applyTaxes) {
    totalRows.push([t.gst, input.totals.gstCents], [t.qst, input.totals.qstCents]);
  }
  for (const [k, v] of totalRows) {
    right(k, colUnit, y, { size: 10, color: muted });
    right(money(v), xr - 8, y, { size: 10 });
    y -= 15;
  }
  y -= 10;
  page.drawRectangle({ x: colUnit - 110, y: y - 10, width: xr - colUnit + 110, height: 26, color: accent });
  const white = rgb(1, 1, 1);
  right(t.total, colUnit, y, { size: 12, f: bold, color: white });
  right(money(input.totals.totalCents), xr - 8, y, { size: 12, f: bold, color: white });
  y -= 36;

  // Notes / payment instructions.
  const notes = [input.notes ?? "", input.applyTaxes ? "" : t.noTaxes].filter((s) => s.trim());
  for (const n of notes) {
    for (const w of wrap(n, font, 9, W - 2 * M)) {
      if (y < M + 20) {
        page = doc.addPage([W, H]);
        pages.push(page);
        y = H - M;
      }
      text(w, M, y, { size: 9, color: muted });
      y -= 12;
    }
    y -= 6;
  }

  if (pages.length > 1) {
    pages.forEach((p, i) => {
      const s = `${t.page} ${i + 1} / ${pages.length}`;
      p.drawText(s, { x: W - M - font.widthOfTextAtSize(s, 8), y: 24, size: 8, font, color: muted });
    });
  }

  return doc.save();
}
