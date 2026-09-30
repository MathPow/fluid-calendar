/**
 * Excel round-trip for the Fiscalité tab, in the layout of the user's own
 * bookkeeping workbook (compta-dehors-qc.xlsx): Identification, Configuration,
 * Revenus, Dépenses, État des résultats, Taxes Annuel (FPZ-500 aide-mémoire),
 * Suivi des Avances, Suivi des Retraits, Amortissements.
 *
 * Export writes values for the rows we know and the template's formulas on the
 * empty rows below, so lines added in Excel still compute. Import reads the
 * Revenus / Dépenses / Avances / Retraits sheets back (cached formula results,
 * or the template's formulas redone when a file was saved without them).
 */
import ExcelJS from "exceljs";

import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  PAID_BY_ME,
  categoryFromLabel,
  categoryLabel,
  categoryOf,
} from "./meta";

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export interface ExportInvoice {
  direction: string;
  date: string; // YYYY-MM-DD
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

export interface ExportMovement {
  date: string;
  kind: string;
  partner: string;
  amountCents: number;
  account: string | null;
  notes: string | null;
}

export interface ExportInput {
  organisation: string;
  year: number;
  legalForm: string;
  salesTaxStatus: string;
  partners: string[];
  /** % per associé, same order; empty = equal parts. */
  partnerShares?: number[];
  /** Company file lines for the Identification sheet (label → value). */
  identity?: [string, string | null | undefined][];
  invoices: ExportInvoice[];
  movements: ExportMovement[];
}

const MONEY = '#,##0.00 "$";-#,##0.00 "$"';
const DATE = "yyyy-mm-dd";
const HEAD_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F1E23" } };
const INPUT_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDDEBF7" } };
const TOTAL_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2F2F2" } };
const TAX_TYPES = '"Aucune,TPS,TPS+TVQ"';
/** Empty rows (with formulas) left under the data for lines added in Excel. */
const SPARE_ROWS = 100;

const toDate = (ymd: string) => new Date(`${ymd}T00:00:00Z`);
const dollars = (cents: number) => Math.round(cents) / 100;

function taxType(inv: { gstCents: number; qstCents: number }) {
  if (inv.qstCents) return "TPS+TVQ";
  if (inv.gstCents) return "TPS";
  return "Aucune";
}

function title(ws: ExcelJS.Worksheet, cell: string, text: string) {
  ws.getCell(cell).value = text;
  ws.getCell(cell).font = { bold: true, size: 16 };
}

function header(ws: ExcelJS.Worksheet, rowNumber: number, labels: string[], firstCol = 1) {
  const row = ws.getRow(rowNumber);
  labels.forEach((label, i) => {
    const c = row.getCell(firstCol + i);
    c.value = label;
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = HEAD_FILL;
    c.alignment = { vertical: "middle", wrapText: true };
  });
  row.height = 30;
}

function note(ws: ExcelJS.Worksheet, range: string, text: string) {
  ws.mergeCells(range);
  const c = ws.getCell(range.split(":")[0]);
  c.value = text;
  c.font = { italic: true, color: { argb: "FF6B6B6B" } };
  c.alignment = { wrapText: true, vertical: "top" };
}

const ME_CELL = "Moi (de ma poche)";
const partnerCell = (name: string) => (name === PAID_BY_ME ? ME_CELL : `Associé (${name})`);

export async function buildWorkbook(input: ExportInput): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "DreamDash";
  wb.created = new Date();
  const senc = input.legalForm === "senc";
  const expenses = input.invoices.filter((i) => i.direction !== "revenu").sort((a, b) => a.date.localeCompare(b.date));
  const revenues = input.invoices.filter((i) => i.direction === "revenu").sort((a, b) => a.date.localeCompare(b.date));

  // Identification ---------------------------------------------------------
  const id = wb.addWorksheet("Identification");
  id.columns = [{ width: 28 }, { width: 36 }, { width: 12 }, { width: 12 }, { width: 12 }];
  title(id, "A2", "Identification");
  id.getCell("A4").value = "Nom de l'entreprise:";
  id.getCell("B4").value = input.organisation;
  id.getCell("A5").value = "Période de déclaration:";
  id.getCell("B5").value = input.year;
  for (const c of ["B4", "B5"]) id.getCell(c).fill = INPUT_FILL;
  if (senc) {
    id.getCell("A6").value = "Associés:";
    id.getCell("B6").value = input.partners.join(", ");
  }
  const lines = (input.identity ?? []).filter(([, v]) => v);
  lines.forEach(([label, value], i) => {
    id.getCell(`A${8 + i}`).value = `${label}:`;
    id.getCell(`B${8 + i}`).value = value;
  });
  const idNote = 9 + lines.length;
  note(
    id,
    `A${idNote}:E${idNote + 1}`,
    "Exporté de DreamDash (onglet Fiscalité). Réimporte ce fichier après l'avoir modifié: les lignes sont fusionnées avec celles déjà classées."
  );

  // Configuration ----------------------------------------------------------
  const conf = wb.addWorksheet("Configuration");
  conf.columns = [{ width: 34 }, { width: 4 }, { width: 34 }, { width: 8 }, { width: 8 }, { width: 8 }];
  title(conf, "A2", "Configuration des catégories");
  conf.getCell("A4").value = "REVENUS";
  conf.getCell("C4").value = "DÉPENSES";
  conf.getCell("A4").font = conf.getCell("C4").font = { bold: true };
  const used = (dir: string) =>
    input.invoices
      .filter((i) => (dir === "revenu") === (i.direction === "revenu"))
      .map((i) => categoryLabel(dir, i.category))
      .filter((l) => l !== "Sans catégorie");
  const revLabels = Array.from(new Set([...INCOME_CATEGORIES.map((c) => c.label), ...used("revenu")]));
  const expLabels = Array.from(new Set([...EXPENSE_CATEGORIES.map((c) => c.label), ...used("depense")]));
  revLabels.forEach((l, i) => (conf.getCell(5 + i, 1).value = l));
  expLabels.forEach((l, i) => (conf.getCell(5 + i, 3).value = l));
  const revList = `Configuration!$A$5:$A$${4 + revLabels.length}`;
  const expList = `Configuration!$C$5:$C$${4 + expLabels.length}`;
  const confNoteRow = 6 + Math.max(revLabels.length, expLabels.length);
  note(
    conf,
    `A${confNoteRow}:F${confNoteRow + 2}`,
    "Les catégories de dépenses suivent les lignes de la T2125 / TP-80. Un compte que tu ajoutes ici reste tel quel au réimport (déductible à 100 %)."
  );

  // Revenus ----------------------------------------------------------------
  const rev = wb.addWorksheet("Revenus", { views: [{ state: "frozen", ySplit: 4 }] });
  rev.columns = [12, 26, 34, 26, 16, 12, 14, 12, 16, 40, 14].map((width) => ({ width }));
  title(rev, "A1", `Revenus — ${input.organisation}`);
  header(rev, 2, [
    "Date",
    "Client / Partenaire",
    "Description",
    "Compte",
    "Net (Sans taxes)",
    "TPS (5%)",
    "TVQ (9,975%)",
    "Type de taxe",
    "Total (avec taxes)",
    "Commentaires",
    "# Facture",
  ]);
  const revLast = Math.max(204, 4 + revenues.length + SPARE_ROWS);
  revenues.forEach((inv, i) => {
    const r = 5 + i;
    rev.getRow(r).values = [
      toDate(inv.date),
      inv.party ?? "",
      inv.description ?? "",
      inv.category ? categoryLabel("revenu", inv.category) : "",
      dollars(inv.subtotalCents),
      dollars(inv.gstCents),
      dollars(inv.qstCents),
      taxType(inv),
      dollars(inv.totalCents),
      inv.notes ?? "",
      inv.number ?? "",
    ];
  });
  fillFormulas(rev, 5 + revenues.length, revLast, { total: "I", type: "H", net: "E", gst: "F", qst: "G" });
  totals(rev, 4, revLast, ["E", "F", "G", "I"]);
  styleColumns(rev, 5, revLast, "A", ["E", "F", "G", "I"]);
  validate(rev, `D5:D${revLast}`, revList);
  validate(rev, `H5:H${revLast}`, TAX_TYPES);

  // Dépenses ---------------------------------------------------------------
  const dep = wb.addWorksheet("Dépenses", { views: [{ state: "frozen", ySplit: 4 }] });
  dep.columns = [18, 12, 24, 32, 26, 16, 12, 14, 12, 16, 40, 16].map((width) => ({ width }));
  title(dep, "A1", `Dépenses — ${input.organisation}`);
  header(dep, 2, [
    "# Facture",
    "Date",
    "Fournisseur",
    "Description",
    "Compte",
    "Net (Sans taxes)",
    "TPS (5%)",
    "TVQ (9,975%)",
    "Type de taxe",
    "Total (avec taxes)",
    "Commentaires",
    "Payé par",
  ]);
  const depLast = Math.max(204, 4 + expenses.length + SPARE_ROWS);
  expenses.forEach((inv, i) => {
    dep.getRow(5 + i).values = [
      inv.number ?? "",
      toDate(inv.date),
      inv.party ?? "",
      inv.description ?? "",
      inv.category ? categoryLabel("depense", inv.category) : "",
      dollars(inv.subtotalCents),
      dollars(inv.gstCents),
      dollars(inv.qstCents),
      taxType(inv),
      dollars(inv.totalCents),
      inv.notes ?? "",
      inv.paidBy ? partnerCell(inv.paidBy) : "Société",
    ];
  });
  fillFormulas(dep, 5 + expenses.length, depLast, { total: "J", type: "I", net: "F", gst: "G", qst: "H" });
  totals(dep, 4, depLast, ["F", "G", "H", "J"]);
  styleColumns(dep, 5, depLast, "B", ["F", "G", "H", "J"]);
  validate(dep, `E5:E${depLast}`, expList);
  validate(dep, `I5:I${depLast}`, TAX_TYPES);
  validate(
    dep,
    `L5:L${depLast}`,
    `"${["Société", ...(input.partners.length ? input.partners.map(partnerCell) : [ME_CELL])].join(",").replace(/"/g, "")}"`
  );

  // État des résultats ------------------------------------------------------
  const er = wb.addWorksheet("États des résultats");
  er.columns = [{ width: 3 }, { width: 36 }, { width: 18 }, { width: 18 }, { width: 22 }];
  title(er, "B1", "État des résultats");
  er.getCell("B2").value = { formula: "Identification!B4" };
  er.getCell("B3").value = { formula: "Identification!B5" };
  header(er, 6, ["Revenus", "Montant Global", "% pour fin d'affaires", "Montant lié à l'activité"], 2);
  let r = 8;
  const revStart = r;
  revLabels.forEach((_, i) => {
    er.getCell(`B${r}`).value = { formula: `Configuration!A${5 + i}` };
    er.getCell(`C${r}`).value = { formula: `SUMIFS(Revenus!$E:$E,Revenus!$D:$D,$B${r})` };
    er.getCell(`D${r}`).value = 1;
    er.getCell(`E${r}`).value = { formula: `C${r}*D${r}` };
    r++;
  });
  const revEnd = r - 1;
  r++;
  er.getCell(`B${r}`).value = "Total des revenus";
  er.getCell(`E${r}`).value = { formula: `SUM(E${revStart}:E${revEnd})` };
  const revTotalRow = r;
  r += 2;
  header(er, r, ["Dépenses", "Montant Global", "% pour fin d'affaires", "Montant lié à l'activité"], 2);
  r += 2;
  const expStart = r;
  expLabels.forEach((label, i) => {
    const cat = categoryOf(categoryFromLabel("depense", label));
    er.getCell(`B${r}`).value = { formula: `Configuration!C${5 + i}` };
    er.getCell(`C${r}`).value = { formula: `SUMIFS('Dépenses'!$F:$F,'Dépenses'!$E:$E,$B${r})` };
    // Meals 50 %; equipment goes through the DPA (Amortissements), not here.
    er.getCell(`D${r}`).value = cat ? cat.deductible : 1;
    er.getCell(`E${r}`).value = { formula: `C${r}*D${r}` };
    r++;
  });
  const expEnd = r - 1;
  r++;
  er.getCell(`B${r}`).value = "Total des dépenses";
  er.getCell(`E${r}`).value = { formula: `SUM(E${expStart}:E${expEnd})` };
  const expTotalRow = r;
  r += 2;
  er.getCell(`B${r}`).value = "Profit net";
  er.getCell(`E${r}`).value = { formula: `E${revTotalRow}-E${expTotalRow}` };
  const profitRow = r;
  for (const row of [revTotalRow, expTotalRow, profitRow]) {
    er.getRow(row).font = { bold: true };
    er.getCell(`E${row}`).fill = TOTAL_FILL;
  }
  for (let i = 8; i <= profitRow; i++) {
    er.getCell(`C${i}`).numFmt = MONEY;
    er.getCell(`E${i}`).numFmt = MONEY;
    er.getCell(`D${i}`).numFmt = "0%";
  }
  if (senc && input.partners.length) {
    r += 2;
    const shares =
      input.partnerShares?.length === input.partners.length
        ? input.partnerShares
        : input.partners.map(() => 100 / input.partners.length);
    er.getCell(`B${r}`).value = "Part de chaque associé (RL-15)";
    er.getCell(`B${r}`).font = { bold: true };
    r++;
    input.partners.forEach((p, i) => {
      er.getCell(`B${r}`).value = p;
      er.getCell(`D${r}`).value = shares[i] / 100;
      er.getCell(`D${r}`).numFmt = "0.##%";
      er.getCell(`E${r}`).value = { formula: `E${profitRow}*D${r}` };
      er.getCell(`E${r}`).numFmt = MONEY;
      r++;
    });
  }

  // Taxes Annuel -----------------------------------------------------------
  const tx = wb.addWorksheet("Taxes Annuel");
  tx.columns = [{ width: 3 }, { width: 44 }, { width: 16 }, { width: 4 }, { width: 4 }, { width: 52 }, { width: 16 }];
  title(tx, "B2", "Formulaire FPZ-500 — aide-mémoire");
  tx.getCell("B4").value = "Fournitures (chiffre d'affaires) (ligne 101)";
  tx.getCell("C4").value = { formula: "Revenus!E4" };
  tx.getCell("B9").value = "DÉCLARATION DE LA TPS";
  tx.getCell("F9").value = "DÉCLARATION DE LA TVQ";
  tx.getCell("B9").font = tx.getCell("F9").font = { bold: true };
  tx.getCell("B12").value = "Total de la TPS exigible (ligne 105)";
  tx.getCell("C12").value = { formula: "Revenus!F4" };
  tx.getCell("F12").value = "TVQ exigible (ligne 203)";
  tx.getCell("G12").value = { formula: "Revenus!G4" };
  tx.getCell("B14").value = "Total des CTI (ligne 108)";
  tx.getCell("C14").value = { formula: "'Dépenses'!G4" };
  tx.getCell("F14").value = "Remboursements de la taxe sur les intrants (RTI) (ligne 206)";
  tx.getCell("G14").value = { formula: "'Dépenses'!H4" };
  tx.getCell("B16").value = "TPS nette (ligne 109)";
  tx.getCell("C16").value = { formula: "C12-C14" };
  tx.getCell("F16").value = "TVQ nette (ligne 208)";
  tx.getCell("G16").value = { formula: "G12-G14" };
  tx.getCell("B20").value = "GRAND TOTAL À REMETTRE";
  tx.getCell("B20").font = { bold: true };
  tx.getCell("C20").value = { formula: "C16+G16" };
  tx.getCell("C20").fill = TOTAL_FILL;
  for (const c of ["C4", "C12", "C14", "C16", "G12", "G14", "G16", "C20"]) tx.getCell(c).numFmt = MONEY;
  note(
    tx,
    "B23:G25",
    (input.salesTaxStatus === "inscrit"
      ? ""
      : "Petit fournisseur: tu n'as pas de déclaration de TPS/TVQ à produire tant que tu n'es pas inscrit. ") +
      "Aide-mémoire seulement, ne remplace pas les formulaires officiels de Revenu Québec. Les repas ne donnent droit qu'à 50 % des CTI/RTI. Un montant négatif veut dire un remboursement à recevoir."
  );

  // Suivi des Avances ------------------------------------------------------
  const av = wb.addWorksheet("Suivi des Avances");
  av.columns = [12, 22, 22, 14, 44, 22, 3, 38, 16].map((width) => ({ width }));
  title(av, "A1", "Suivi des avances des associés");
  header(av, 3, ["Date", "De", "À", "Montant", "Commentaires", "Compte"]);
  const avRows: (string | number | Date)[][] = [];
  for (const inv of expenses.filter((i) => i.paidBy)) {
    avRows.push([
      toDate(inv.date),
      partnerCell(inv.paidBy!),
      "Société",
      dollars(inv.totalCents),
      `Facture ${inv.number ? `#${inv.number} ` : ""}${inv.party ?? ""} (auto)`.replace(/\s+/g, " "),
      inv.category ? categoryLabel("depense", inv.category) : "",
    ]);
  }
  for (const m of input.movements.filter((m) => m.kind !== "retrait")) {
    const toSenc = m.kind === "avance";
    avRows.push([
      toDate(m.date),
      toSenc ? partnerCell(m.partner) : "Société",
      toSenc ? "Société" : partnerCell(m.partner),
      dollars(m.amountCents),
      m.notes ?? "",
      m.account ?? "",
    ]);
  }
  avRows.sort((a, b) => (a[0] as Date).getTime() - (b[0] as Date).getTime());
  avRows.forEach((values, i) => (av.getRow(4 + i).values = values));
  const avLast = Math.max(53, 3 + avRows.length + SPARE_ROWS);
  styleColumns(av, 4, avLast, "A", ["D"]);
  const who = input.partners[0] ?? "";
  av.getCell("H2").value = "Associé à suivre :";
  av.getCell("I2").value = who;
  av.getCell("I2").fill = INPUT_FILL;
  if (input.partners.length) validate(av, "I2", `"${input.partners.join(",")}"`);
  av.getCell("H4").value = "Montant avancé (associé → société)";
  av.getCell("I4").value = { formula: `SUMIFS(D4:D${avLast},B4:B${avLast},"Associé ("&$I$2&")",C4:C${avLast},"Société")` };
  av.getCell("H5").value = "Montant remboursé (société → associé)";
  av.getCell("I5").value = { formula: `SUMIFS(D4:D${avLast},B4:B${avLast},"Société",C4:C${avLast},"Associé ("&$I$2&")")` };
  av.getCell("H6").value = "Solde net dû à l'associé";
  av.getCell("I6").value = { formula: "I4-I5" };
  av.getCell("H6").font = { bold: true };
  for (const c of ["I4", "I5", "I6"]) av.getCell(c).numFmt = MONEY;
  note(
    av,
    "H8:I12",
    'Convention: "Associé (Nom)" et "Société" dans De/À selon le sens. Les lignes « (auto) » viennent des factures payées par un associé: modifie plutôt la colonne « Payé par » des Dépenses.'
  );

  // Suivi des Retraits -----------------------------------------------------
  const rt = wb.addWorksheet("Suivi des Retraits-Dividendes");
  rt.columns = [16, 18, 44, 20, 10, 16].map((width) => ({ width }));
  title(rt, "A1", "Suivi des retraits / dividendes");
  note(
    rt,
    "A2:F3",
    "Utilise « retraits » si la société est une SENC, « dividendes » si elle est incorporée (société par actions). Le calcul est le même dans les deux cas."
  );
  header(rt, 5, ["Date de versement", "Montant - Associé", "Commentaires", "Associé"]);
  const draws = input.movements.filter((m) => m.kind === "retrait").sort((a, b) => a.date.localeCompare(b.date));
  draws.forEach((m, i) => {
    rt.getRow(6 + i).values = [toDate(m.date), dollars(m.amountCents), m.notes ?? "", m.partner];
  });
  const rtLast = Math.max(55, 5 + draws.length + SPARE_ROWS);
  rt.getCell("E5").value = "Total :";
  rt.getCell("F5").value = { formula: `SUM(B6:B${rtLast})` };
  rt.getCell("F5").numFmt = MONEY;
  styleColumns(rt, 6, rtLast, "A", ["B"]);

  // Amortissements ---------------------------------------------------------
  const am = wb.addWorksheet("Amortissements");
  am.columns = [12, 36, 14, 14, 14, 14, 14, 8, 16, 14].map((width) => ({ width }));
  title(am, "A1", "Amortissements");
  am.getCell("A2").value = { formula: "Identification!B4" };
  am.getCell("A3").value = { formula: "Identification!B5" };
  header(am, 5, [
    "CATÉGORIE",
    "DESCRIPTION",
    "FNACC DÉBUT",
    "ACQUISITION",
    "DISPOSITION",
    "RÉAJUSTEMENT",
    "TOTAL",
    "%",
    "AMORTISSEMENT",
    "FNACC FIN",
  ]);
  const assets = expenses.filter((i) => categoryOf(i.category)?.capital);
  const amEnd = Math.max(13, 5 + assets.length);
  assets.forEach((inv, i) => {
    const row = 6 + i;
    am.getCell(`B${row}`).value = [inv.party, inv.description].filter(Boolean).join(" · ") || "Équipement";
    am.getCell(`D${row}`).value = dollars(inv.subtotalCents);
  });
  am.getCell(`A${amEnd + 1}`).value = "Total";
  am.getRow(amEnd + 1).font = { bold: true };
  for (const col of ["C", "D", "E", "F", "G", "I", "J"]) {
    am.getCell(`${col}${amEnd + 1}`).value = { formula: `SUM(${col}6:${col}${amEnd})` };
    for (let i = 6; i <= amEnd + 1; i++) am.getCell(`${col}${i}`).numFmt = MONEY;
  }
  note(
    am,
    `A${amEnd + 4}:J${amEnd + 6}`,
    "Les factures classées « Équipement (DPA) » sont listées en acquisition. Choisis la catégorie (ex. 50 pour un ordi, 8 pour l'équipement général) et le taux avec ton comptable; la règle de la demi-année s'applique la première année."
  );

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf as ArrayBuffer);
}

/** Template formulas on the rows left empty for Excel entries. */
function fillFormulas(
  ws: ExcelJS.Worksheet,
  from: number,
  to: number,
  c: { total: string; type: string; net: string; gst: string; qst: string }
) {
  for (let r = from; r <= to; r++) {
    const T = `${c.total}${r}`;
    const Y = `${c.type}${r}`;
    ws.getCell(`${c.net}${r}`).value = { formula: `IF(${T}="","",${T}-${c.gst}${r}-${c.qst}${r})` };
    ws.getCell(`${c.gst}${r}`).value = {
      formula: `IF(OR(${Y}="TPS",${Y}="TPS+TVQ"),${T}/(1+IF(${Y}="TPS+TVQ",0.14975,0.05))*0.05,0)`,
    };
    ws.getCell(`${c.qst}${r}`).value = { formula: `IF(${Y}="TPS+TVQ",${T}/1.14975*0.09975,0)` };
  }
}

function totals(ws: ExcelJS.Worksheet, row: number, last: number, cols: string[]) {
  ws.getCell(`A${row}`).value = "Totaux";
  ws.getRow(row).font = { bold: true };
  for (const col of cols) {
    const c = ws.getCell(`${col}${row}`);
    c.value = { formula: `SUM(${col}5:${col}${last})` };
    c.numFmt = MONEY;
    c.fill = TOTAL_FILL;
  }
}

function styleColumns(ws: ExcelJS.Worksheet, from: number, to: number, dateCol: string, moneyCols: string[]) {
  for (let r = from; r <= to; r++) {
    ws.getCell(`${dateCol}${r}`).numFmt = DATE;
    for (const col of moneyCols) ws.getCell(`${col}${r}`).numFmt = MONEY;
  }
}

function validate(ws: ExcelJS.Worksheet, range: string, formula: string) {
  // exceljs has no range-wide validation API; set it on each cell.
  const [a, b] = range.split(":");
  const start = ws.getCell(a);
  const end = ws.getCell(b ?? a);
  for (let r = Number(start.row); r <= Number(end.row); r++) {
    for (let col = Number(start.col); col <= Number(end.col); col++) {
      ws.getCell(r, col).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: [formula],
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

/** Optional fields are undefined when the sheet has no such column (keep ours). */
export interface ParsedInvoice {
  direction: "depense" | "revenu";
  date: string;
  party?: string | null;
  number?: string | null;
  description?: string | null;
  category?: string | null;
  subtotalCents: number;
  gstCents: number;
  qstCents: number;
  totalCents: number;
  notes?: string | null;
  paidBy?: string | null;
  row: number;
}

export interface ParsedMovement {
  date: string;
  kind: "avance" | "remboursement" | "retrait";
  partner: string;
  amountCents: number;
  account: string | null;
  notes: string | null;
}

export interface ParsedWorkbook {
  organisation: string | null;
  year: number | null;
  invoices: ParsedInvoice[];
  movements: ParsedMovement[];
  partners: string[];
  skipped: { sheet: string; row: number; reason: string }[];
}

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/** A cell's plain value: formula results unwrapped, rich text flattened. */
function plain(v: ExcelJS.CellValue): unknown {
  if (v == null) return null;
  if (v instanceof Date) return v;
  if (typeof v === "object") {
    if ("result" in v) return plain((v as ExcelJS.CellFormulaValue).result as ExcelJS.CellValue);
    if ("formula" in v || "sharedFormula" in v) return undefined; // formula without a cached result
    if ("richText" in v) return (v as ExcelJS.CellRichTextValue).richText.map((t) => t.text).join("");
    if ("text" in v) return (v as ExcelJS.CellHyperlinkValue).text;
    if ("error" in v) return null;
  }
  return v;
}

function str(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(v);
  const s = String(v).trim();
  return s ? s : null;
}

function money(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return Math.round(v * 100);
  if (typeof v === "string" && v.trim()) {
    const n = Number(v.replace(/[\s$ ]/g, "").replace(",", "."));
    return Number.isFinite(n) ? Math.round(n * 100) : null;
  }
  return null;
}

function day(v: unknown): string | null {
  if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  if (typeof v === "number" && v > 20000 && v < 80000) {
    // Excel serial date.
    return new Date(Date.UTC(1899, 11, 30) + v * 86_400_000).toISOString().slice(0, 10);
  }
  if (typeof v === "string") {
    const m = v.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    const f = v.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (f) return `${f[3]}-${f[2].padStart(2, "0")}-${f[1].padStart(2, "0")}`;
  }
  return null;
}

function partnerName(v: string | null): string | null {
  if (!v) return null;
  const m = v.match(/associ[ée]\s*\(([^)]+)\)/i);
  if (m) return m[1].trim();
  const f = fold(v);
  if (f === "moi" || f.startsWith("moi ") || f.startsWith("moi(")) return PAID_BY_ME;
  if (!f || f === "societe" || f === "senc" || f === "entreprise" || f === "compagnie") return null;
  return v.trim();
}

/** Column index (1-based) per field, from a header row. */
function mapHeader(row: ExcelJS.Row): Record<string, number> {
  const out: Record<string, number> = {};
  row.eachCell((cell, col) => {
    const h = fold(String(plain(cell.value) ?? ""));
    if (!h) return;
    const set = (k: string) => (out[k] ??= col);
    if (h === "date" || h.startsWith("date de")) set("date");
    else if (h.startsWith("client") || h.startsWith("fournisseur")) set("party");
    else if (h.startsWith("description")) set("description");
    else if (h === "compte" || h.startsWith("categorie")) set("category");
    else if (h.startsWith("net")) set("net");
    else if (h.startsWith("tps")) set("gst");
    else if (h.startsWith("tvq")) set("qst");
    else if (h.startsWith("type de taxe")) set("type");
    else if (h.startsWith("total")) set("total");
    else if (h.startsWith("commentaire")) set("notes");
    else if (h.includes("facture")) set("number");
    else if (h.startsWith("paye par")) set("paidBy");
    else if (h === "de") set("from");
    else if (h === "a") set("to");
    else if (h.startsWith("montant")) set("amount");
    else if (h.startsWith("associe")) set("partner");
  });
  return out;
}

function findHeader(ws: ExcelJS.Worksheet): { row: number; cols: Record<string, number> } | null {
  for (let r = 1; r <= 10; r++) {
    const cols = mapHeader(ws.getRow(r));
    if (cols.date && (cols.total || cols.amount || cols.net)) return { row: r, cols };
  }
  return null;
}

function sheet(wb: ExcelJS.Workbook, test: (name: string) => boolean) {
  return wb.worksheets.find((ws) => test(fold(ws.name)));
}

export async function parseWorkbook(data: ArrayBuffer): Promise<ParsedWorkbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(data);
  const out: ParsedWorkbook = {
    organisation: null,
    year: null,
    invoices: [],
    movements: [],
    partners: [],
    skipped: [],
  };

  const ident = sheet(wb, (n) => n === "identification");
  if (ident) {
    out.organisation = str(plain(ident.getCell("B4").value));
    const y = plain(ident.getCell("B5").value);
    out.year = typeof y === "number" ? Math.round(y) : Number(str(y)) || null;
    const partners = str(plain(ident.getCell("B6").value));
    if (fold(String(plain(ident.getCell("A6").value) ?? "")).startsWith("associe") && partners) {
      out.partners.push(...partners.split(/[,;]/).map((p) => p.trim()).filter(Boolean));
    }
  }

  const readInvoices = (ws: ExcelJS.Worksheet | undefined, direction: "depense" | "revenu") => {
    if (!ws) return;
    const head = findHeader(ws);
    if (!head) {
      out.skipped.push({ sheet: ws.name, row: 0, reason: "En-têtes introuvables" });
      return;
    }
    const c = head.cols;
    ws.eachRow((row, r) => {
      if (r <= head.row) return;
      const get = (k: string) => (c[k] ? plain(row.getCell(c[k]).value) : null);
      const date = day(get("date"));
      const firstText = fold(String(plain(row.getCell(1).value) ?? ""));
      if (firstText.startsWith("tota")) return; // "Total", "Totaux"
      let total = money(get("total"));
      let net = money(get("net"));
      if (!date && total == null) return; // empty template line
      if (!date) {
        out.skipped.push({ sheet: ws.name, row: r, reason: "Date manquante" });
        return;
      }
      const type = str(get("type"))?.toUpperCase() ?? null;
      let gst = money(get("gst"));
      let qst = money(get("qst"));
      // Formulas saved without results: redo the template's math.
      if (total != null) {
        if (gst == null) gst = type === "TPS+TVQ" ? Math.round((total / 1.14975) * 0.05) : type === "TPS" ? Math.round((total / 1.05) * 0.05) : 0;
        if (qst == null) qst = type === "TPS+TVQ" ? Math.round((total / 1.14975) * 0.09975) : 0;
        if (net == null) net = total - gst - qst;
      } else if (net != null) {
        gst ??= 0;
        qst ??= 0;
        total = net + gst + qst;
      }
      if (total == null || net == null) {
        out.skipped.push({ sheet: ws.name, row: r, reason: "Montant manquant" });
        return;
      }
      const opt = (k: string) => (c[k] ? str(get(k)) : undefined);
      const paidBy = c.paidBy ? partnerName(str(get("paidBy"))) : undefined;
      if (paidBy && paidBy !== PAID_BY_ME && !out.partners.includes(paidBy)) out.partners.push(paidBy);
      const category = opt("category");
      out.invoices.push({
        direction,
        date,
        party: opt("party"),
        number: opt("number"),
        description: opt("description"),
        category: category === undefined ? undefined : categoryFromLabel(direction, category),
        subtotalCents: net,
        gstCents: gst ?? 0,
        qstCents: qst ?? 0,
        totalCents: total,
        notes: opt("notes"),
        paidBy,
        row: r,
      });
    });
  };
  readInvoices(sheet(wb, (n) => n === "revenus"), "revenu");
  readInvoices(sheet(wb, (n) => n === "depenses"), "depense");

  const av = sheet(wb, (n) => n.startsWith("suivi des avances"));
  if (av) {
    const head = findHeader(av);
    if (head) {
      const c = head.cols;
      av.eachRow((row, r) => {
        if (r <= head.row) return;
        const get = (k: string) => (c[k] ? plain(row.getCell(c[k]).value) : null);
        const date = day(get("date"));
        const amount = money(get("amount"));
        if (!date || !amount) return;
        const notes = str(get("notes"));
        if (notes && /\(auto\)\s*$/.test(notes)) return; // rebuilt from Dépenses › Payé par
        const from = partnerName(str(get("from")));
        const to = partnerName(str(get("to")));
        if (!!from === !!to) {
          out.skipped.push({ sheet: av.name, row: r, reason: "De/À: un associé et la Société attendus" });
          return;
        }
        const partner = (from ?? to)!;
        if (!out.partners.includes(partner)) out.partners.push(partner);
        out.movements.push({
          date,
          kind: from ? "avance" : "remboursement",
          partner,
          amountCents: Math.abs(amount),
          account: str(get("category")),
          notes,
        });
      });
    }
  }

  const rt = sheet(wb, (n) => n.startsWith("suivi des retraits"));
  if (rt) {
    const head = findHeader(rt);
    if (head) {
      const c = head.cols;
      rt.eachRow((row, r) => {
        if (r <= head.row) return;
        const get = (k: string) => (c[k] ? plain(row.getCell(c[k]).value) : null);
        const date = day(get("date"));
        const amount = money(get("amount"));
        if (!date || !amount) return;
        const partner = str(get("partner")) ?? out.partners[0] ?? null;
        if (!partner) {
          out.skipped.push({ sheet: rt.name, row: r, reason: "Associé inconnu" });
          return;
        }
        out.movements.push({
          date,
          kind: "retrait",
          partner,
          amountCents: Math.abs(amount),
          account: null,
          notes: str(get("notes")),
        });
      });
    }
  }

  return out;
}
