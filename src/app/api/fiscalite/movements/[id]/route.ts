import { NextRequest, NextResponse } from "next/server";

import { getT } from "@/i18n/server";
import { authenticateRequest } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "fiscalite-movement-api";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** DELETE /api/fiscalite/movements/[id] */
export async function DELETE(request: NextRequest, { params }: Ctx) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const t = await getT();
  const { id } = await params;
  try {
    await prisma.partnerMovement.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: t("api.fiscalite.movementNotFound") }, { status: 404 });
  }
}
