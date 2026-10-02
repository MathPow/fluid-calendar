import { PDFDocument } from "pdf-lib";

import {
  addPeriod,
  computeTotals,
  displayStatus,
  fillTemplate,
  nextInvoiceNumber,
  readLines,
} from "../meta";
import { pdfSafe, renderInvoicePdf } from "../pdf";

describe("computeTotals", () => {
  it("adds TPS 5 % and TVQ 9,975 % on the subtotal", () => {
    const t = computeTotals(
      [
        { description: "Dev", quantity: 10, unitCents: 8500 },
        { description: "Hébergement", quantity: 1, unitCents: 2500 },
      ],
      true
    );
    expect(t).toEqual({ subtotalCents: 87500, gstCents: 4375, qstCents: 8728, totalCents: 100603 });
  });

  it("charges no taxes for a small supplier, and rounds fractional quantities", () => {
    expect(computeTotals([{ description: "Heures", quantity: 1.5, unitCents: 3333 }], false)).toEqual({
      subtotalCents: 5000,
      gstCents: 0,
      qstCents: 0,
      totalCents: 5000,
    });
  });
});

describe("nextInvoiceNumber", () => {
  it("continues the highest number, keeping its shape", () => {
    expect(nextInvoiceNumber(["INV-0041", "INV-0009", null])).toBe("INV-0042");
    expect(nextInvoiceNumber(["17", "3"])).toBe("18");
    expect(nextInvoiceNumber(["F099"])).toBe("F100");
  });

  it("starts at 1 with no history", () => {
    expect(nextInvoiceNumber([])).toBe("1");
  });

  it("uses the prefix's own sequence when one is set", () => {
    expect(nextInvoiceNumber(["F-2026-002", "F-2026-010", "INV-0099"], "F-2026-")).toBe("F-2026-011");
    expect(nextInvoiceNumber(["INV-0099"], "F-2027-")).toBe("F-2027-001");
  });
});

describe("addPeriod", () => {
  const d = (s: string) => new Date(`${s}T13:00:00Z`);
  const day = (x: Date) => x.toISOString().slice(0, 10);

  it("steps weeks, months, quarters and years", () => {
    expect(day(addPeriod(d("2026-10-02"), "weekly"))).toBe("2026-10-09");
    expect(day(addPeriod(d("2026-10-02"), "weekly", 2))).toBe("2026-10-16");
    expect(day(addPeriod(d("2026-10-02"), "monthly"))).toBe("2026-11-02");
    expect(day(addPeriod(d("2026-11-15"), "quarterly"))).toBe("2027-02-15");
    expect(day(addPeriod(d("2028-02-29"), "yearly"))).toBe("2029-02-28");
  });

  it("clamps to the end of shorter months and keeps the time of day", () => {
    const next = addPeriod(d("2026-01-31"), "monthly");
    expect(day(next)).toBe("2026-02-28");
    expect(next.getUTCHours()).toBe(13);
  });
});

describe("helpers", () => {
  it("fills templates and leaves unknown placeholders", () => {
    expect(fillTemplate("Facture {number} · {client} {x}", { number: "12", client: "Acme" })).toBe(
      "Facture 12 · Acme {x}"
    );
  });

  it("flags sent invoices past their due date as overdue", () => {
    expect(displayStatus({ status: "sent", dueDate: "2026-09-01" }, "2026-10-02")).toBe("overdue");
    expect(displayStatus({ status: "sent", dueDate: "2026-10-02" }, "2026-10-02")).toBe("sent");
    expect(displayStatus({ status: "paid", dueDate: "2026-09-01" }, "2026-10-02")).toBe("paid");
    expect(displayStatus({ status: null, dueDate: null }, "2026-10-02")).toBe("imported");
  });

  it("reads the lines column defensively", () => {
    expect(readLines(null)).toEqual([]);
    expect(readLines([{ description: "A", quantity: "2", unitCents: 100.4 }, {}])).toEqual([
      { description: "A", quantity: 2, unitCents: 100 },
    ]);
  });
});

describe("renderInvoicePdf", () => {
  it("keeps French accents and replaces what Helvetica can't draw", () => {
    expect(pdfSafe("Écoute « ça » — 1 234,56 $ ≈ ✓")).toBe("Écoute « ça » — 1 234,56 $ ? ?");
  });

  it("produces a valid PDF that spills onto more pages with many lines", async () => {
    const lines = Array.from({ length: 40 }, (_, i) => ({
      description: `Ligne ${i + 1} — développement d'une fonctionnalité assez longue pour passer à la ligne dans la colonne`,
      quantity: 1,
      unitCents: 1000,
    }));
    const bytes = await renderInvoicePdf({
      lang: "fr",
      number: "F-001",
      date: "2026-10-02",
      dueDate: "2026-11-01",
      issuer: { name: "Uguiso Technologies", details: ["123 rue Principale", "Québec QC G1A 1A1"], gstNumber: "123456789RT0001", qstNumber: "1234567890TQ0001" },
      client: { name: "Acme inc.", billTo: "1 rue du Client\nMontréal QC", email: "compta@acme.test" },
      title: "Abonnement mensuel",
      lines,
      totals: computeTotals(lines, true),
      applyTaxes: true,
      notes: "Paiement par virement Interac à paiement@exemple.com",
    });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThan(1);
    expect(doc.getTitle()).toBe("FACTURE F-001");
  });
});
