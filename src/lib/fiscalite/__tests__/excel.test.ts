import { buildWorkbook, parseWorkbook } from "../excel";
import { planInvoices } from "../import-plan";
import { partnerSummaries } from "../meta";

const base = {
  party: "Zoho Canada",
  number: "5500818021",
  description: "Workplace Mail Lite",
  category: "logiciels",
  notes: null,
  paidBy: null,
};

const toAB = (b: Buffer) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;

describe("excel round trip", () => {
  it("reads back what it writes", async () => {
    const buf = await buildWorkbook({
      organisation: "Dehors QC",
      year: 2026,
      legalForm: "senc",
      salesTaxStatus: "inscrit",
      partners: ["Mathys", "Félix"],
      invoices: [
        { ...base, direction: "depense", date: "2026-07-30", subtotalCents: 1323, gstCents: 66, qstCents: 132, totalCents: 1521 },
        { ...base, direction: "depense", date: "2026-08-12", party: "Amazon", number: null, category: "Serveur perso", subtotalCents: 1000, gstCents: 0, qstCents: 0, totalCents: 1000, paidBy: "Félix" },
        { ...base, direction: "revenu", date: "2026-01-15", party: "Garmin", number: null, category: "autres-revenus", subtotalCents: 10762, gstCents: 538, qstCents: 0, totalCents: 11300 },
      ],
      movements: [
        { date: "2026-08-01", kind: "avance", partner: "Mathys", amountCents: 50000, account: null, notes: "mise de fonds" },
        { date: "2026-09-01", kind: "retrait", partner: "Félix", amountCents: 20000, account: null, notes: null },
      ],
    });
    const p = await parseWorkbook(toAB(buf));
    expect(p.organisation).toBe("Dehors QC");
    expect(p.year).toBe(2026);
    expect(p.partners).toEqual(["Mathys", "Félix"]);
    expect(p.skipped).toEqual([]);
    expect(p.invoices).toHaveLength(3);
    const amazon = p.invoices.find((i) => i.party === "Amazon")!;
    expect(amazon).toMatchObject({ paidBy: "Félix", category: "Serveur perso", totalCents: 1000 });
    const zoho = p.invoices.find((i) => i.party === "Zoho Canada")!;
    expect(zoho).toMatchObject({ number: "5500818021", gstCents: 66, qstCents: 132, category: "logiciels", paidBy: null });
    // The auto advance line (Amazon paid by Félix) isn't read back as a movement.
    expect(p.movements.map((m) => `${m.kind}:${m.partner}:${m.amountCents}`).sort()).toEqual([
      "avance:Mathys:50000",
      "retrait:Félix:20000",
    ]);
  });
});

describe("planInvoices", () => {
  const existing = {
    id: "a",
    direction: "depense",
    date: "2026-07-30",
    party: "Zoho Canada",
    number: "5500818021",
    description: null,
    category: "logiciels",
    subtotalCents: 1323,
    gstCents: 66,
    qstCents: 132,
    totalCents: 1521,
    notes: null,
    paidBy: "Mathys",
  };
  it("matches by number, keeps fields the sheet doesn't have", () => {
    const plan = planInvoices(
      [
        { direction: "depense", date: "2026-07-30", number: "5500818021", subtotalCents: 1323, gstCents: 66, qstCents: 132, totalCents: 1521, description: "Mail", row: 5 },
        { direction: "depense", date: "2026-08-01", subtotalCents: 100, gstCents: 0, qstCents: 0, totalCents: 100, row: 6 },
      ],
      [existing]
    );
    expect(plan.create).toHaveLength(1);
    expect(plan.update).toEqual([expect.objectContaining({ id: "a", changes: { description: "Mail" } })]);
  });
});

describe("partnerSummaries", () => {
  it("adds paid invoices and advances, subtracts reimbursements", () => {
    const inv = { id: "1", direction: "depense", date: "2026-05-01", party: null, partyTaxNumber: null, number: null, category: null, subtotalCents: 0, gstCents: 0, qstCents: 0, totalCents: 10000, hasFile: false, paidBy: "Félix" };
    const [m, f] = partnerSummaries(
      ["Mathys", "Félix"],
      [inv],
      [{ id: "m", date: "2026-05-02", kind: "remboursement", partner: "Félix", amountCents: 4000, account: null, notes: null }],
      50000
    );
    expect(m).toMatchObject({ partner: "Mathys", balanceCents: 0, profitShareCents: 25000 });
    expect(f).toMatchObject({ partner: "Félix", paidCents: 10000, balanceCents: 6000, profitShareCents: 25000 });
  });
});
