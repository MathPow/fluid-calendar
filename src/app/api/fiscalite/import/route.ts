import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { parseWorkbook } from "@/lib/fiscalite/excel";
import { planInvoices, planMovements } from "@/lib/fiscalite/import-plan";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "fiscalite-import";

export const dynamic = "force-dynamic";

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const at = (s: string) => new Date(`${s}T00:00:00Z`);

/**
 * POST /api/fiscalite/import — multipart `file` (.xlsx), `organisationId`,
 * `apply` ("1" to write; otherwise a dry run that only returns the plan).
 */
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const organisationId = String(form?.get("organisationId") ?? "");
  const apply = form?.get("apply") === "1";
  if (!(file instanceof File)) return NextResponse.json({ error: "Fichier manquant" }, { status: 400 });
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "Fichier trop lourd (10 Mo max)" }, { status: 413 });
  }
  const org = await prisma.organisation.findUnique({
    where: { id: organisationId },
    select: { id: true, name: true, taxProfile: true },
  });
  if (!org) return NextResponse.json({ error: "Organisation introuvable" }, { status: 404 });
  const personal = org.taxProfile?.legalForm === "personnel";

  let parsed;
  try {
    parsed = await parseWorkbook(await file.arrayBuffer(), personal);
  } catch (error) {
    logger.warn(
      "Unreadable workbook",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json({ error: "Classeur illisible (.xlsx attendu)" }, { status: 400 });
  }

  const [invoices, movements] = await Promise.all([
    prisma.invoice.findMany({ where: { organisationId } }),
    prisma.partnerMovement.findMany({ where: { organisationId } }),
  ]);
  const invPlan = planInvoices(
    parsed.invoices,
    invoices.map((i) => ({ ...i, date: ymd(i.date) }))
  );
  const movPlan = planMovements(
    parsed.movements,
    movements.map((m) => ({ ...m, date: ymd(m.date) }))
  );
  const known = org.taxProfile?.partners ?? [];
  const newPartners = parsed.partners.filter((p) => !known.some((k) => k.toLowerCase() === p.toLowerCase()));

  const summary = {
    fileOrganisation: parsed.organisation,
    fileYear: parsed.year,
    nameMismatch:
      !!parsed.organisation &&
      parsed.organisation.toLowerCase().replace(/\s+/g, "") !== org.name.toLowerCase().replace(/\s+/g, ""),
    invoices: {
      create: invPlan.create.length,
      update: invPlan.update.length,
      same: invPlan.same,
      preview: [...invPlan.create.map((r) => ({ ...r, action: "create" as const })), ...invPlan.update.map((u) => ({ ...u.row, action: "update" as const }))]
        .slice(0, 12)
        .map((r) => ({
          action: r.action,
          direction: r.direction,
          date: r.date,
          party: r.party ?? null,
          totalCents: r.totalCents,
        })),
    },
    movements: { create: movPlan.create.length, same: movPlan.same },
    newPartners,
    skipped: parsed.skipped,
  };
  if (!apply) return NextResponse.json({ ...summary, applied: false });

  await prisma.$transaction(async (tx) => {
    if (invPlan.create.length) {
      await tx.invoice.createMany({
        data: invPlan.create.map((r) => ({
          organisationId,
          direction: r.direction,
          date: at(r.date),
          subtotalCents: r.subtotalCents,
          gstCents: r.gstCents,
          qstCents: r.qstCents,
          totalCents: r.totalCents,
          party: r.party ?? null,
          number: r.number ?? null,
          description: r.description ?? null,
          category: r.category ?? null,
          notes: r.notes ?? null,
          paidBy: r.paidBy ?? null,
        })),
      });
    }
    for (const u of invPlan.update) {
      const { date, ...changes } = u.changes as Record<string, unknown>;
      await tx.invoice.update({
        where: { id: u.id },
        data: { ...changes, ...(typeof date === "string" ? { date: at(date) } : {}) },
      });
    }
    if (movPlan.create.length) {
      await tx.partnerMovement.createMany({
        data: movPlan.create.map((m) => ({ ...m, organisationId, date: at(m.date) })),
      });
    }
    if (newPartners.length) {
      await tx.taxProfile.upsert({
        where: { organisationId },
        create: { organisationId, partners: newPartners, setUp: false },
        update: { partners: [...known, ...newPartners] },
      });
    }
  });
  return NextResponse.json({ ...summary, applied: true });
}
