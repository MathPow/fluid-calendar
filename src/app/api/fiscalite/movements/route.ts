import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { movementSelect, toMovementView } from "@/lib/fiscalite/queries";
import { MovementInput } from "@/lib/fiscalite/schemas";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "fiscalite-movements-api";

export const dynamic = "force-dynamic";

/** POST /api/fiscalite/movements — an avance, a remboursement or a retrait. */
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const parsed = MovementInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { date, ...rest } = parsed.data;
  const row = await prisma.partnerMovement.create({
    data: { ...rest, date: new Date(`${date}T00:00:00Z`) },
    select: movementSelect,
  });
  return NextResponse.json(toMovementView(row), { status: 201 });
}
