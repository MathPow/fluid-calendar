import { NextRequest, NextResponse } from "next/server";

import { getT } from "@/i18n/server";
import { authenticateRequest } from "@/lib/auth/api-auth";
import { buildWorkbook } from "@/lib/fiscalite/excel";
import { DEFAULT_PROFILE, fiscalYearRange } from "@/lib/fiscalite/meta";
import { XLSX_MIME } from "@/lib/fiscalite/schemas";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/projets/meta";

const LOG_SOURCE = "fiscalite-export";

export const dynamic = "force-dynamic";

/** GET /api/fiscalite/export?organisationId=&year= — the year as an .xlsx workbook. */
export async function GET(request: NextRequest) {
  const t = await getT();
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const organisationId = request.nextUrl.searchParams.get("organisationId") ?? "";
  const year = Number(request.nextUrl.searchParams.get("year"));
  if (!organisationId || !Number.isInteger(year)) {
    return NextResponse.json({ error: "organisationId et year requis" }, { status: 400 });
  }
  const org = await prisma.organisation.findUnique({
    where: { id: organisationId },
    select: { name: true, taxProfile: true },
  });
  if (!org) return NextResponse.json({ error: t("api.organisations.notFound") }, { status: 404 });

  const profile = org.taxProfile ?? { ...DEFAULT_PROFILE, partners: [] as string[], partnerShares: [] as number[] };
  const tp = org.taxProfile;
  const { start, end } = fiscalYearRange(profile, year);
  const range = { gte: start, lte: end };
  const [invoices, movements] = await Promise.all([
    prisma.invoice.findMany({ where: { organisationId, date: range }, orderBy: { date: "asc" } }),
    prisma.partnerMovement.findMany({ where: { organisationId, date: range }, orderBy: { date: "asc" } }),
  ]);
  const ymd = (d: Date) => d.toISOString().slice(0, 10);

  const buf = await buildWorkbook({
    organisation: org.name,
    year,
    legalForm: profile.legalForm,
    salesTaxStatus: profile.salesTaxStatus,
    partners: profile.partners ?? [],
    partnerShares: profile.partnerShares ?? [],
    identity: tp
      ? [
          ["Nom légal", tp.legalName],
          ["NEQ", tp.neq],
          ["No d'identification Revenu Québec", tp.rqNumber],
          ["No TVQ", tp.qstNumber],
          ["No TPS", tp.gstNumber],
          ["NE fédéral (ARC)", tp.businessNumber],
          ["Dossier employeur (RS)", tp.payrollNumber],
          ["Immatriculation au REQ", tp.startedAt?.toISOString().slice(0, 10)],
          ["Activité", tp.activity],
          ["Code SCIAN", tp.naicsCode],
          ["Adresse", [tp.address, tp.city, tp.province, tp.postalCode].filter(Boolean).join(", ") || null],
          ["Courriel", tp.email],
          ["Téléphone", tp.phone],
          ["Site web", tp.website],
          ["Comptable", [tp.accountant, tp.accountantEmail, tp.accountantPhone].filter(Boolean).join(" · ") || null],
        ]
      : [],
    invoices: invoices.map((i) => ({ ...i, date: ymd(i.date) })),
    movements: movements.map((m) => ({ ...m, date: ymd(m.date) })),
  });
  const name = `compta-${slugify(org.name) || "entreprise"}-${year}.xlsx`;
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": XLSX_MIME,
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
