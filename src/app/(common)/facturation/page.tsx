import { FacturationBoard } from "@/components/facturation/FacturationBoard";

import { recurringView } from "@/lib/facturation/recurring";
import { issuedSelect, nextNumberFor, settingsFor, toIssuedView } from "@/lib/facturation/service";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function FacturationPage() {
  const [organisations, contacts, invoices, recurring] = await Promise.all([
    // The companies flagged in Fiscalité (not the personal budget) issue invoices.
    prisma.organisation.findMany({
      where: { taxProfile: { tracked: true, legalForm: { not: "personnel" } } },
      select: {
        id: true,
        name: true,
        color: true,
        image: true,
        kind: true,
        taxProfile: { select: { legalName: true, salesTaxStatus: true } },
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.contact.findMany({
      select: { id: true, name: true, email: true, company: true, type: true },
      orderBy: [{ favorite: "desc" }, { name: "asc" }],
    }),
    prisma.invoice.findMany({
      where: { direction: "revenu" },
      select: issuedSelect,
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    }),
    prisma.recurringInvoice.findMany({ orderBy: [{ active: "desc" }, { nextRunAt: "asc" }] }),
  ]);
  organisations.sort((a, b) => Number(b.kind === "owned") - Number(a.kind === "owned"));

  const settings = Object.fromEntries(
    await Promise.all(
      organisations.map(async (o) => {
        const [s, nextNumber] = await Promise.all([settingsFor(o.id), nextNumberFor(o.id)]);
        return [
          o.id,
          {
            numberPrefix: s.numberPrefix,
            dueDays: s.dueDays,
            lang: s.lang === "en" ? ("en" as const) : ("fr" as const),
            notes: s.notes,
            mailAccountId: s.mailAccountId,
            emailSubject: s.emailSubject,
            emailBody: s.emailBody,
            nextNumber,
          },
        ] as const;
      })
    )
  );

  return (
    <FacturationBoard
      organisations={organisations.map((o) => ({
        id: o.id,
        name: o.name,
        color: o.color,
        image: o.image,
        legalName: o.taxProfile?.legalName ?? null,
        registered: o.taxProfile?.salesTaxStatus === "inscrit",
      }))}
      contacts={contacts}
      invoices={invoices.map(toIssuedView)}
      recurring={recurring.map(recurringView)}
      settings={settings}
    />
  );
}
