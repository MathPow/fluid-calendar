/**
 * Fiscalité d'entrepreneur au Québec: the rules the Fiscalité tab applies.
 * Pure functions only, so the page, the API and the tests share them.
 *
 * Sources: ARC (T2125, RC4022 TPS/TVH, IC 88-2 / GST/HST Memorandum 8.4 for
 * invoice requirements) and Revenu Québec (TP-80, IN-203 TVQ). These are the
 * general rules; the guide says so and points to a comptable for edge cases.
 */

export const GST_RATE = 0.05;
export const QST_RATE = 0.09975;
/** Taxable sales over four consecutive quarters above which you must register. */
export const SMALL_SUPPLIER_LIMIT_CENTS = 30_000_00;

export type Direction = "depense" | "revenu";
export type LegalForm = "individuelle" | "senc" | "societe";
export type SalesTaxStatus = "petit" | "inscrit";
export type FilingFrequency = "annuelle" | "trimestrielle" | "mensuelle";

export const LEGAL_FORMS: { id: LegalForm; label: string; hint: string }[] = [
  {
    id: "individuelle",
    label: "Entreprise individuelle",
    hint: "Travailleur autonome · T2125 + TP-80 dans ta déclaration perso",
  },
  {
    id: "senc",
    label: "SENC",
    hint: "Société en nom collectif · TP-600, chaque associé déclare sa part",
  },
  {
    id: "societe",
    label: "Société (inc.)",
    hint: "Personne morale · T2 + CO-17, exercice à part",
  },
];

export const SALES_TAX_STATUSES: { id: SalesTaxStatus; label: string; hint: string }[] = [
  { id: "petit", label: "Petit fournisseur", hint: "Pas inscrit, tu ne factures pas de taxes" },
  { id: "inscrit", label: "Inscrit TPS/TVQ", hint: "Tu factures et tu récupères les taxes" },
];

export const FILING_FREQUENCIES: { id: FilingFrequency; label: string }[] = [
  { id: "annuelle", label: "Annuelle" },
  { id: "trimestrielle", label: "Trimestrielle" },
  { id: "mensuelle", label: "Mensuelle" },
];

export interface ExpenseCategory {
  id: string;
  label: string;
  /** T2125 line (the TP-80 uses the same headings). */
  line?: string;
  /** Share of the amount that is deductible (and of the taxes you can claim back). */
  deductible: number;
  hint?: string;
  /** Equipment: not an expense, depreciated through the DPA instead. */
  capital?: boolean;
}

export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  { id: "publicite", label: "Publicité", line: "8521", deductible: 1, hint: "Pubs, Meta/Google Ads, imprimés" },
  {
    id: "repas",
    label: "Repas et représentation",
    line: "8523",
    deductible: 0.5,
    hint: "Déductible à 50 %, taxes récupérables à 50 %. Note avec qui et pourquoi.",
  },
  { id: "assurances", label: "Assurances", line: "8690", deductible: 1 },
  { id: "interets", label: "Intérêts et frais bancaires", line: "8710", deductible: 1 },
  { id: "bureau", label: "Frais de bureau", line: "8810", deductible: 1, hint: "Petits articles, timbres, papeterie" },
  { id: "logiciels", label: "Logiciels et abonnements", line: "8810", deductible: 1, hint: "SaaS, hébergement, domaines, licences" },
  { id: "fournitures", label: "Fournitures", line: "8811", deductible: 1, hint: "Matériel consommé pour produire" },
  { id: "honoraires", label: "Honoraires professionnels", line: "8860", deductible: 1, hint: "Comptable, avocat, notaire" },
  { id: "sous-traitance", label: "Sous-traitance", line: "8871", deductible: 1, hint: "Pigistes, frais de gestion" },
  { id: "loyer", label: "Loyer", line: "8910", deductible: 1, hint: "Local commercial (pas ton appart: voir bureau à domicile)" },
  { id: "entretien", label: "Entretien et réparations", line: "8960", deductible: 1 },
  { id: "salaires", label: "Salaires", line: "9060", deductible: 1, hint: "Pense aux retenues à la source et aux T4/RL-1" },
  { id: "deplacements", label: "Déplacements", line: "9200", deductible: 1, hint: "Transport, hôtel (les repas vont dans Repas)" },
  { id: "telecom", label: "Téléphone et services publics", line: "9220", deductible: 1, hint: "Seulement la part d'affaires" },
  { id: "vehicule", label: "Frais de véhicule", line: "9281", deductible: 1, hint: "Tiens un registre de kilométrage" },
  { id: "domicile", label: "Bureau à domicile", line: "9945", deductible: 1, hint: "Au prorata de la superficie, sans créer de perte" },
  { id: "autres", label: "Autres dépenses", line: "9270", deductible: 1 },
  {
    id: "immobilisation",
    label: "Équipement (DPA)",
    deductible: 0,
    capital: true,
    hint: "Ordi, caméra, meubles: amorti par la DPA, pas déduit d'un coup. Les taxes restent récupérables.",
  },
];

export const INCOME_CATEGORIES = [
  { id: "services", label: "Services" },
  { id: "ventes", label: "Ventes de produits" },
  { id: "billetterie", label: "Billetterie / événements" },
  { id: "commandites", label: "Commandites" },
  { id: "autres-revenus", label: "Autres revenus" },
];

/** Spreadsheet account names that mean one of our categories. */
const CATEGORY_ALIASES: Record<string, string> = {
  equipements: "immobilisation",
  equipement: "immobilisation",
  marketing: "publicite",
  gaz: "vehicule",
  essence: "vehicule",
  "email professionnel": "logiciels",
  "nom de domaine": "logiciels",
  serveur: "logiciels",
  hebergement: "logiciels",
  comptable: "honoraires",
};

const fold = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

/**
 * A spreadsheet "Compte" → our category id. Unknown names are kept as they
 * are: a custom category, deductible at 100 %.
 */
export function categoryFromLabel(direction: string, label: string | null | undefined): string | null {
  if (!label?.trim()) return null;
  const key = fold(label);
  const list: { id: string; label: string }[] =
    direction === "revenu" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const hit = list.find((c) => fold(c.label) === key || c.id === key);
  if (hit) return hit.id;
  if (direction !== "revenu" && CATEGORY_ALIASES[key]) return CATEGORY_ALIASES[key];
  return label.trim();
}

export function categoryOf(id: string | null | undefined): ExpenseCategory | undefined {
  return EXPENSE_CATEGORIES.find((c) => c.id === id);
}

export function categoryLabel(direction: string, id: string | null | undefined): string {
  if (!id) return "Sans catégorie";
  const list: { id: string; label: string }[] =
    direction === "revenu" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  return list.find((c) => c.id === id)?.label ?? id;
}

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

export function formatMoney(cents: number, opts?: { signed?: boolean }): string {
  const s = new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD" }).format(
    cents / 100
  );
  return opts?.signed && cents > 0 ? `+${s}` : s;
}

/** "1 234,56" / "1,234.56" / "1234.5" → cents. Returns null when unreadable. */
export function parseMoney(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  let s = String(raw).replace(/[\s  $]/g, "").replace(/CAD$/i, "");
  if (!s) return null;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > lastDot) {
    // "1.234,56" or "1234,56": comma is the decimal separator.
    s = s.replace(/\./g, "").replace(",", ".");
  } else {
    s = s.replace(/,/g, "");
  }
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** Taxes on a subtotal at Québec rates. */
export function taxesFor(subtotalCents: number) {
  const gst = Math.round(subtotalCents * GST_RATE);
  const qst = Math.round(subtotalCents * QST_RATE);
  return { gst, qst, total: subtotalCents + gst + qst };
}

// ---------------------------------------------------------------------------
// Fiscal years and deadlines
// ---------------------------------------------------------------------------

export interface TaxProfileLite {
  legalForm: string;
  partners?: string[];
  partnerShares?: number[];
  salesTaxStatus: string;
  gstNumber: string | null;
  qstNumber: string | null;
  filingFrequency: string;
  fiscalYearEnd: string;
}

export const DEFAULT_PROFILE: TaxProfileLite = {
  legalForm: "individuelle",
  salesTaxStatus: "petit",
  gstNumber: null,
  qstNumber: null,
  filingFrequency: "annuelle",
  fiscalYearEnd: "12-31",
};

/** Local-date helpers: invoices are dated by day, never by instant. */
function ymd(y: number, m: number, d: number) {
  return new Date(Date.UTC(y, m - 1, d));
}
function lastDayOfMonth(y: number, m: number) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
/** Same day `n` months later, clamped; month-ends stay month-ends. */
function addMonths(date: Date, n: number): Date {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + 1;
  const d = date.getUTCDate();
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const wasEnd = d === lastDayOfMonth(y, m);
  const nd = wasEnd ? lastDayOfMonth(ny, nm) : Math.min(d, lastDayOfMonth(ny, nm));
  return ymd(ny, nm, nd);
}
function addDays(date: Date, n: number) {
  return new Date(date.getTime() + n * 86_400_000);
}

/**
 * The fiscal year labelled `year` ends in that calendar year. An individual
 * always uses the calendar year; a société uses its own year-end.
 */
export function fiscalYearRange(profile: TaxProfileLite, year: number) {
  // A SENC of individuals closes on December 31 like its associés.
  const [mm, dd] =
    profile.legalForm === "societe"
      ? (profile.fiscalYearEnd || "12-31").split("-").map(Number)
      : [12, 31];
  const end = ymd(year, mm || 12, Math.min(dd || 31, lastDayOfMonth(year, mm || 12)));
  const start = addDays(addMonths(end, -12), 1);
  return { start, end };
}

/** Which fiscal year a date falls in. */
export function fiscalYearOf(profile: TaxProfileLite, date: Date): number {
  const y = date.getUTCFullYear();
  const { end } = fiscalYearRange(profile, y);
  return date.getTime() > end.getTime() ? y + 1 : y;
}

export interface Deadline {
  date: Date;
  title: string;
  detail: string;
  kind: "impot" | "taxes" | "acompte" | "paie";
  /** Only applies in some cases (worded in `detail`). */
  conditional?: boolean;
}

/** Every deadline tied to fiscal year `year`, in date order. */
export function deadlinesFor(profile: TaxProfileLite, year: number): Deadline[] {
  const out: Deadline[] = [];
  const { start, end } = fiscalYearRange(profile, year);
  const registered = profile.salesTaxStatus === "inscrit";

  if (profile.legalForm === "societe") {
    out.push({
      date: addMonths(end, 2),
      title: "Payer le solde d'impôt de la société",
      detail:
        "2 mois après la fin d'exercice (3 mois pour une SPCC qui a droit à la déduction pour petite entreprise).",
      kind: "impot",
    });
    out.push({
      date: addMonths(end, 6),
      title: "Produire la T2 (ARC) et la CO-17 (Revenu Québec)",
      detail: "6 mois après la fin d'exercice. Avec les états financiers (IFRS/NCECF ou GIFI).",
      kind: "impot",
    });
    out.push({
      date: ymd(year + 1, 2, 28),
      title: "T4 / RL-1 et sommaires",
      detail: "Si la société t'a versé un salaire (ou à d'autres): fin février. Dividendes: T5 / RL-3.",
      kind: "paie",
      conditional: true,
    });
  } else if (profile.legalForm === "senc") {
    out.push({
      date: ymd(year + 1, 3, 31),
      title: "Produire la TP-600 et remettre les RL-15 aux associés",
      detail:
        "Déclaration de renseignements de la SENC (Revenu Québec). La T5013 fédérale seulement si elle est requise (gros revenus ou actifs, associé société…).",
      kind: "impot",
    });
    out.push({
      date: ymd(year + 1, 4, 30),
      title: "Chaque associé paie son solde d'impôt",
      detail: "La SENC ne paie pas d'impôt: chacun paie sur sa part du bénéfice (plus RRQ / RQAP).",
      kind: "impot",
    });
    out.push({
      date: ymd(year + 1, 6, 15),
      title: "Chaque associé produit T1 + T2125 et TP-1 + TP-80",
      detail: "Avec sa part du bénéfice (RL-15) et ses propres dépenses non remboursées (ligne 9943).",
      kind: "impot",
    });
    for (const [m, d] of [
      [3, 15],
      [6, 15],
      [9, 15],
      [12, 15],
    ] as const) {
      out.push({
        date: ymd(year, m, d),
        title: "Acompte provisionnel (chaque associé)",
        detail: "Si l'impôt d'un associé à payer dépasse 1 800 $. Chacun reçoit ses propres avis.",
        kind: "acompte",
        conditional: true,
      });
    }
  } else {
    for (const [m, d] of [
      [3, 15],
      [6, 15],
      [9, 15],
      [12, 15],
    ] as const) {
      out.push({
        date: ymd(year, m, d),
        title: "Acompte provisionnel",
        detail:
          "Si ton impôt à payer dépasse 1 800 $ (Québec, et 1 800 $ au fédéral pour un résident du Québec) cette année et l'une des deux précédentes. Les avis te le disent.",
        kind: "acompte",
        conditional: true,
      });
    }
    out.push({
      date: ymd(year + 1, 4, 30),
      title: "Payer le solde d'impôt (et RRQ / RQAP)",
      detail:
        "Même si tu as jusqu'au 15 juin pour produire, les intérêts courent à partir du 30 avril.",
      kind: "impot",
    });
    out.push({
      date: ymd(year + 1, 6, 15),
      title: "Produire T1 + T2125 et TP-1 + TP-80",
      detail: "Date limite pour les travailleurs autonomes (et leur conjoint).",
      kind: "impot",
    });
  }

  if (registered) {
    const freq = profile.filingFrequency as FilingFrequency;
    if (freq === "annuelle") {
      // The April 30 / June 15 rule is for individuals; a SENC or a société
      // files three months after its year-end.
      if (profile.legalForm === "individuelle") {
        out.push({
          date: ymd(year + 1, 4, 30),
          title: "Payer la TPS/TVQ de l'année",
          detail: "Déclarant annuel travailleur autonome: paiement au 30 avril…",
          kind: "taxes",
        });
        out.push({
          date: ymd(year + 1, 6, 15),
          title: "Produire la déclaration TPS/TVQ annuelle",
          detail: "…et déclaration au 15 juin. Une seule déclaration à Revenu Québec couvre les deux taxes.",
          kind: "taxes",
        });
      } else {
        out.push({
          date: addMonths(end, 3),
          title: "Déclaration et paiement TPS/TVQ annuels",
          detail: "3 mois après la fin d'exercice. Une seule déclaration à Revenu Québec.",
          kind: "taxes",
        });
      }
    } else {
      const step = freq === "mensuelle" ? 1 : 3;
      for (let i = step; i <= 12; i += step) {
        const periodEnd = addDays(addMonths(start, i), -1);
        out.push({
          date: addMonths(periodEnd, 1),
          title: `TPS/TVQ · période au ${formatDay(periodEnd, { short: true })}`,
          detail: "Déclaration et paiement 1 mois après la fin de la période.",
          kind: "taxes",
        });
      }
    }
  }

  return out.sort((a, b) => a.date.getTime() - b.date.getTime());
}

export function formatDay(date: Date, opts?: { short?: boolean }): string {
  return new Intl.DateTimeFormat("fr-CA", {
    day: "numeric",
    month: opts?.short ? "short" : "long",
    year: opts?.short ? undefined : "numeric",
    timeZone: "UTC",
  }).format(date);
}

// ---------------------------------------------------------------------------
// Totals and the guide
// ---------------------------------------------------------------------------

export interface InvoiceLite {
  id: string;
  direction: string;
  date: string | Date;
  party: string | null;
  partyTaxNumber: string | null;
  number: string | null;
  category: string | null;
  subtotalCents: number;
  gstCents: number;
  qstCents: number;
  totalCents: number;
  hasFile: boolean;
}

export interface YearSummary {
  revenueCents: number;
  gstCollected: number;
  qstCollected: number;
  expenseCents: number;
  /** What actually lowers the taxable income (50 % meals, no equipment). */
  deductibleCents: number;
  capitalCents: number;
  gstPaid: number;
  qstPaid: number;
  /** Input tax credits you can claim (only when registered). */
  itc: number;
  itr: number;
  profitCents: number;
  byCategory: { id: string; label: string; line?: string; cents: number; deductibleCents: number }[];
}

export function summarize(invoices: InvoiceLite[], profile: TaxProfileLite): YearSummary {
  const registered = profile.salesTaxStatus === "inscrit";
  const s: YearSummary = {
    revenueCents: 0,
    gstCollected: 0,
    qstCollected: 0,
    expenseCents: 0,
    deductibleCents: 0,
    capitalCents: 0,
    gstPaid: 0,
    qstPaid: 0,
    itc: 0,
    itr: 0,
    profitCents: 0,
    byCategory: [],
  };
  const cats = new Map<string, YearSummary["byCategory"][number]>();

  for (const inv of invoices) {
    if (inv.direction === "revenu") {
      s.revenueCents += inv.subtotalCents;
      s.gstCollected += inv.gstCents;
      s.qstCollected += inv.qstCents;
      continue;
    }
    const cat = categoryOf(inv.category);
    const share = cat ? cat.deductible : 1;
    // Not registered: the taxes you paid are part of the cost.
    const cost = registered ? inv.subtotalCents : inv.totalCents || inv.subtotalCents;
    s.expenseCents += cost;
    s.gstPaid += inv.gstCents;
    s.qstPaid += inv.qstCents;
    if (registered) {
      const claim = cat?.id === "repas" ? 0.5 : 1;
      s.itc += Math.round(inv.gstCents * claim);
      s.itr += Math.round(inv.qstCents * claim);
    }
    let deductible = 0;
    if (cat?.capital) s.capitalCents += cost;
    else deductible = Math.round(cost * share);
    s.deductibleCents += deductible;

    const key = cat?.id ?? "_none";
    const row = cats.get(key) ?? {
      id: key,
      label: cat?.label ?? "Sans catégorie",
      line: cat?.line,
      cents: 0,
      deductibleCents: 0,
    };
    row.cents += cost;
    row.deductibleCents += deductible;
    cats.set(key, row);
  }
  s.profitCents = s.revenueCents - s.deductibleCents;
  s.byCategory = Array.from(cats.values()).sort((a, b) => b.cents - a.cents);
  return s;
}

/**
 * Taxable sales over the last four calendar quarters (the one in progress
 * included) — the small-supplier test. Also flags a single quarter over the
 * limit, which forces registration right away.
 */
export function smallSupplierTest(invoices: InvoiceLite[], today = new Date()) {
  const qStart = (d: Date) => ymd(d.getUTCFullYear(), Math.floor(d.getUTCMonth() / 3) * 3 + 1, 1);
  const currentQ = qStart(today);
  const from = addMonths(currentQ, -9);
  const quarters = [0, 3, 6, 9].map((n) => ({ start: addMonths(from, n), cents: 0 }));
  for (const inv of invoices) {
    if (inv.direction !== "revenu") continue;
    const d = new Date(inv.date);
    const idx = quarters.findIndex(
      (q, i) => d >= q.start && (i === 3 ? d < addMonths(currentQ, 3) : d < quarters[i + 1].start)
    );
    if (idx >= 0) quarters[idx].cents += inv.subtotalCents;
  }
  const total = quarters.reduce((a, q) => a + q.cents, 0);
  return {
    total,
    quarters,
    ratio: total / SMALL_SUPPLIER_LIMIT_CENTS,
    over: total > SMALL_SUPPLIER_LIMIT_CENTS,
    quarterOver: quarters.some((q) => q.cents > SMALL_SUPPLIER_LIMIT_CENTS),
  };
}

export interface InvoiceIssue {
  level: "warn" | "info";
  text: string;
}

/** What to fix on one invoice before it's audit-proof. */
export function invoiceIssues(inv: InvoiceLite, profile: TaxProfileLite): InvoiceIssue[] {
  const out: InvoiceIssue[] = [];
  const registered = profile.salesTaxStatus === "inscrit";
  if (!inv.hasFile) out.push({ level: "info", text: "Pas de pièce jointe: garde la facture 6 ans." });

  const sum = inv.subtotalCents + inv.gstCents + inv.qstCents;
  if (inv.totalCents && Math.abs(sum - inv.totalCents) > 2) {
    out.push({
      level: "info",
      text: `Sous-total + taxes (${formatMoney(sum)}) ≠ total (${formatMoney(inv.totalCents)}): pourboire, frais ou erreur?`,
    });
  }

  if (inv.direction === "depense") {
    if (!inv.category) out.push({ level: "warn", text: "Choisis une catégorie (ligne de la T2125)." });
    if (registered && inv.gstCents + inv.qstCents > 0 && inv.totalCents >= 100_00 && !inv.partyTaxNumber) {
      out.push({
        level: "warn",
        text: "Facture de 100 $ et plus: il faut le no TPS/TVQ du fournisseur pour réclamer les CTI/RTI.",
      });
    }
    if (inv.category === "repas") {
      out.push({ level: "info", text: "Repas: note avec qui et le but d'affaires." });
    }
  } else {
    if (!registered && inv.gstCents + inv.qstCents > 0) {
      out.push({
        level: "warn",
        text: "Tu factures des taxes sans être inscrit: inscris-toi ou retire-les.",
      });
    }
    if (registered && inv.gstCents + inv.qstCents === 0 && inv.subtotalCents > 0) {
      out.push({
        level: "info",
        text: "Facture émise sans TPS/TVQ: normal seulement si détaxée, exonérée ou client hors Québec/Canada.",
      });
    }
    if (registered && (!profile.gstNumber || !profile.qstNumber)) {
      out.push({ level: "info", text: "Tes nos TPS/TVQ doivent paraître sur tes factures (ajoute-les au profil)." });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// SENC: associés
// ---------------------------------------------------------------------------

export type MovementKind = "avance" | "remboursement" | "retrait";

export const MOVEMENT_KINDS: { id: MovementKind; label: string; hint: string }[] = [
  { id: "avance", label: "Avance", hint: "L'associé met de l'argent dans la SENC" },
  { id: "remboursement", label: "Remboursement", hint: "La SENC rembourse l'associé" },
  { id: "retrait", label: "Retrait", hint: "L'associé se verse une part des profits" },
];

export interface MovementLite {
  id: string;
  date: string | Date;
  kind: string;
  partner: string;
  amountCents: number;
  account: string | null;
  notes: string | null;
}

export interface PartnerSummary {
  partner: string;
  /** Invoices he paid out of pocket. */
  paidCents: number;
  advancedCents: number;
  reimbursedCents: number;
  /** What the SENC owes him (negative: he owes the SENC). */
  balanceCents: number;
  drawsCents: number;
  /** His part of the estimated profit (by share, else equal parts). */
  profitShareCents: number;
  sharePct: number;
}

export function partnerSummaries(
  partners: string[],
  invoices: (InvoiceLite & { paidBy?: string | null })[],
  movements: MovementLite[],
  profitCents: number,
  shares: number[] = []
): PartnerSummary[] {
  const names = Array.from(
    new Set([
      ...partners,
      ...invoices.map((i) => i.paidBy).filter((p): p is string => !!p),
      ...movements.map((m) => m.partner),
    ])
  );
  const n = partners.length || names.length || 1;
  return names.map((partner) => {
    const paidCents = invoices
      .filter((i) => i.direction === "depense" && i.paidBy === partner)
      .reduce((a, i) => a + i.totalCents, 0);
    const sum = (kind: string) =>
      movements.filter((m) => m.partner === partner && m.kind === kind).reduce((a, m) => a + m.amountCents, 0);
    const advancedCents = sum("avance");
    const reimbursedCents = sum("remboursement");
    return {
      partner,
      paidCents,
      advancedCents,
      reimbursedCents,
      balanceCents: paidCents + advancedCents - reimbursedCents,
      drawsCents: sum("retrait"),
      ...(() => {
        const i = partners.indexOf(partner);
        if (i < 0) return { profitShareCents: 0, sharePct: 0 };
        const pct = shares.length === partners.length ? shares[i] : 100 / n;
        return { profitShareCents: Math.round((profitCents * pct) / 100), sharePct: pct };
      })(),
    };
  });
}
