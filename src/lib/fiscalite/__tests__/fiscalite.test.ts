import { guessFromText } from "../extract";
import {
  DEFAULT_PROFILE,
  deadlinesFor,
  fiscalYearOf,
  fiscalYearRange,
  parseMoney,
  smallSupplierTest,
  summarize,
  taxesFor,
} from "../meta";

jest.mock("@/lib/logger", () => ({ logger: { warn: jest.fn(), info: jest.fn() } }));

const iso = (d: Date) => d.toISOString().slice(0, 10);

describe("money", () => {
  it("parses French and English amounts", () => {
    expect(parseMoney("1 234,56 $")).toBe(123456);
    expect(parseMoney("1,234.56")).toBe(123456);
    expect(parseMoney("99.9")).toBe(9990);
    expect(parseMoney("abc")).toBeNull();
  });
  it("computes Québec taxes", () => {
    expect(taxesFor(10000)).toEqual({ gst: 500, qst: 998, total: 11498 });
  });
});

describe("fiscal years", () => {
  const societe = { ...DEFAULT_PROFILE, legalForm: "societe", fiscalYearEnd: "06-30" };
  it("uses the calendar year for an individual", () => {
    const r = fiscalYearRange({ ...DEFAULT_PROFILE, fiscalYearEnd: "06-30" }, 2026);
    expect([iso(r.start), iso(r.end)]).toEqual(["2026-01-01", "2026-12-31"]);
  });
  it("uses the year-end of a société", () => {
    const r = fiscalYearRange(societe, 2026);
    expect([iso(r.start), iso(r.end)]).toEqual(["2025-07-01", "2026-06-30"]);
    expect(fiscalYearOf(societe, new Date("2026-07-02T00:00:00Z"))).toBe(2027);
  });
  it("lists an individual's deadlines", () => {
    const d = deadlinesFor({ ...DEFAULT_PROFILE, salesTaxStatus: "inscrit" }, 2026).map(
      (x) => `${iso(x.date)} ${x.kind}`
    );
    expect(d).toContain("2027-04-30 impot");
    expect(d).toContain("2027-06-15 impot");
    expect(d).toContain("2027-06-15 taxes");
  });
  it("lists quarterly sales-tax periods of a société", () => {
    const d = deadlinesFor({ ...societe, salesTaxStatus: "inscrit", filingFrequency: "trimestrielle" }, 2026)
      .filter((x) => x.kind === "taxes")
      .map((x) => iso(x.date));
    expect(d).toEqual(["2025-10-31", "2026-01-31", "2026-04-30", "2026-07-31"]);
    const t2 = deadlinesFor(societe, 2026).find((x) => x.title.startsWith("Produire la T2"));
    expect(iso(t2!.date)).toBe("2026-12-31");
  });
});

const inv = (o: Partial<Parameters<typeof summarize>[0][number]>) => ({
  id: "x",
  direction: "depense",
  date: "2026-05-01",
  party: null,
  partyTaxNumber: null,
  number: null,
  category: null,
  subtotalCents: 0,
  gstCents: 0,
  qstCents: 0,
  totalCents: 0,
  hasFile: true,
  ...o,
});

describe("summary", () => {
  it("halves meals and claims taxes back when registered", () => {
    const s = summarize(
      [
        inv({ direction: "revenu", subtotalCents: 100000, gstCents: 5000, qstCents: 9975, totalCents: 114975 }),
        inv({ category: "repas", subtotalCents: 10000, gstCents: 500, qstCents: 998, totalCents: 11498 }),
        inv({ category: "immobilisation", subtotalCents: 200000, gstCents: 10000, qstCents: 19950, totalCents: 229950 }),
      ],
      { ...DEFAULT_PROFILE, salesTaxStatus: "inscrit" }
    );
    expect(s.deductibleCents).toBe(5000);
    expect(s.capitalCents).toBe(200000);
    expect(s.itc).toBe(250 + 10000);
    expect(s.profitCents).toBe(95000);
  });
  it("counts taxes as cost for a small supplier", () => {
    const s = summarize([inv({ category: "logiciels", subtotalCents: 10000, gstCents: 500, qstCents: 998, totalCents: 11498 })], DEFAULT_PROFILE);
    expect(s.deductibleCents).toBe(11498);
    expect(s.itc).toBe(0);
  });
  it("sums the last four quarters for the small-supplier test", () => {
    const t = smallSupplierTest(
      [
        inv({ direction: "revenu", date: "2025-09-30", subtotalCents: 999999 }), // too old
        inv({ direction: "revenu", date: "2025-10-01", subtotalCents: 1000000 }),
        inv({ direction: "revenu", date: "2026-09-15", subtotalCents: 2100000 }),
      ],
      new Date("2026-09-29T12:00:00Z")
    );
    expect(t.total).toBe(3100000);
    expect(t.over).toBe(true);
    expect(t.quarterOver).toBe(false);
  });
});

describe("guessFromText", () => {
  it("reads a typical Québec invoice", () => {
    const text = `Studio Pixel inc.
123 rue Saint-Denis, Montréal
Facture no : F-2026-042
Date : 12 septembre 2026
Conception graphique
Sous-total 1 000,00 $
TPS (5 %) 50,00 $
TVQ (9,975 %) 99,75 $
Total 1 149,75 $
TPS : 123456789 RT 0001  TVQ : 1234567890 TQ 0001`;
    const g = guessFromText(text, ["DehorsQC"]);
    expect(g).toMatchObject({
      direction: "depense",
      date: "2026-09-12",
      number: "F-2026-042",
      party: "Studio Pixel inc.",
      subtotalCents: 100000,
      gstCents: 5000,
      qstCents: 9975,
      totalCents: 114975,
      partyTaxNumber: "123456789RT0001 · 1234567890TQ0001",
    });
  });
  it("spots an invoice we issued", () => {
    const g = guessFromText("DehorsQC\nInvoice # 7\n2026-03-04\nSubtotal 200.00\nGST 10.00\nQST 19.95\nTotal 229.95", ["DehorsQC"]);
    expect(g).toMatchObject({ direction: "revenu", date: "2026-03-04", totalCents: 22995, gstCents: 1000 });
  });
});
