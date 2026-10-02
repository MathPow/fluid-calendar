import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { recurringData, recurringView } from "@/lib/facturation/recurring";
import { RecurringInput } from "@/lib/facturation/schemas";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "facturation-recurring-api";

export const dynamic = "force-dynamic";

/** GET /api/facturation/recurring?organisationId= */
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const organisationId = request.nextUrl.searchParams.get("organisationId") ?? undefined;
  const rows = await prisma.recurringInvoice.findMany({
    where: { organisationId },
    orderBy: [{ active: "desc" }, { nextRunAt: "asc" }],
  });
  return NextResponse.json(rows.map(recurringView));
}

/** POST /api/facturation/recurring — a new subscription contract. */
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const parsed = RecurringInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
  }
  const row = await prisma.recurringInvoice.create({
    data: { ...recurringData(parsed.data), userId: auth.userId },
  });
  return NextResponse.json(recurringView(row), { status: 201 });
}
