import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/prisma";
import { LayerInput, layerInclude } from "@/lib/routine-schemas";

const LOG_SOURCE = "routine-layers-api";

/** POST /api/routine/layers — a new, empty layer. */
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const parsed = LayerInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message },
      { status: 400 }
    );
  }
  const count = await prisma.calendarLayer.count({
    where: { userId: auth.userId },
  });
  const layer = await prisma.calendarLayer.create({
    data: { userId: auth.userId, ...parsed.data, sortOrder: count },
    include: layerInclude,
  });
  return NextResponse.json(layer, { status: 201 });
}
