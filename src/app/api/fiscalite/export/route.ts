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
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const tr = await getT();
  const organisationId = request.nextUrl.searchParams.get("organisationId") ?? "";
  const year = Number(request.nextUrl.searchParams.get("year"));
  if (!organisationId || !Number.isInteger(year)) {
    return NextResponse.json({ error: tr("api.fiscalite.export.paramsRequired") }, { status: 400 });
  }
  const org = await prisma.organisation.findUnique({
    where: { id: organisationId },
    select: { name: true, taxProfile: true },
  });
  if (!org) return NextResponse.json({ error: tr("api.fiscalite.export.orgNotFound") }, { status: 404 });

  const profile = org.taxProfile ?? { ...DEFAULT_PROFILE, partners: [] as string[], partnerShares: [] as number[] };
  const t = org.taxProfile;
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
    identity: t
      ? [
          [tr("fiscalite.export.header.legalName"), t.legalName],
          [tr("fiscalite.export.header.neq"), t.neq],
          [tr("fiscalite.export.header.rqNumber"), t.rqNumber],
          [tr("fiscalite.export.header.qstNumber"), t.qstNumber],
          [tr("fiscalite.export.header.gstNumber"), t.gstNumber],
          [tr("fiscalite.export.header.businessNumber"), t.businessNumber],
          [tr("fiscalite.export.header.payrollNumber"), t.payrollNumber],
          [tr("fiscalite.export.header.startedAt"), t.startedAt?.toISOString().slice(0, 10)],
          [tr("fiscalite.export.header.activity"), t.activity],
          [tr("fiscalite.export.header.naicsCode"), t.naicsCode],
          [tr("fiscalite.export.header.address"), [t.address, t.city, t.province, t.postalCode].filter(Boolean).join(", ") || null],
          [tr("fiscalite.export.header.email"), t.email],
          [tr("fiscalite.export.header.phone"), t.phone],
          [tr("fiscalite.export.header.website"), t.website],
          [tr("fiscalite.export.header.accountant"), [t.accountant, t.accountantEmail, t.accountantPhone].filter(Boolean).join(" · ") || null],
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
