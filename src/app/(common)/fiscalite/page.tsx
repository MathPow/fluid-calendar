import { FiscaliteBoard } from "@/components/fiscalite/FiscaliteBoard";

import { invoiceSelect, movementSelect, toInvoiceView, toMovementView } from "@/lib/fiscalite/queries";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function FiscalitePage() {
  const [organisations, profiles, invoices, movements] = await Promise.all([
    // Every organisation: the tab shows the ones flagged in their TaxProfile.
    prisma.organisation.findMany({
      select: { id: true, name: true, color: true, image: true, kind: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.taxProfile.findMany(),
    prisma.invoice.findMany({
      select: invoiceSelect,
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    }),
    prisma.partnerMovement.findMany({ select: movementSelect, orderBy: { date: "desc" } }),
  ]);

  organisations.sort((a, b) => Number(b.kind === "owned") - Number(a.kind === "owned"));

  return (
    <FiscaliteBoard
      organisations={organisations}
      profiles={profiles.map((p) => ({ ...p, updatedAt: undefined }))}
      invoices={invoices.map(toInvoiceView)}
      movements={movements.map(toMovementView)}
    />
  );
}
