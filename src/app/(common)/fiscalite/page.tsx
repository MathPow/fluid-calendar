import { FiscaliteBoard } from "@/components/fiscalite/FiscaliteBoard";

import { invoiceSelect, toInvoiceView } from "@/lib/fiscalite/queries";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function FiscalitePage() {
  const [organisations, profiles, invoices] = await Promise.all([
    // Companies first (owned), then clients; the personal bucket isn't a business.
    prisma.organisation.findMany({
      where: { kind: { not: "perso" } },
      select: { id: true, name: true, color: true, image: true, kind: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.taxProfile.findMany(),
    prisma.invoice.findMany({
      select: invoiceSelect,
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    }),
  ]);

  organisations.sort((a, b) => Number(b.kind === "owned") - Number(a.kind === "owned"));

  return (
    <FiscaliteBoard
      organisations={organisations}
      profiles={profiles.map((p) => ({ ...p, updatedAt: undefined }))}
      invoices={invoices.map(toInvoiceView)}
    />
  );
}
