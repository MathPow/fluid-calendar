import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/prisma";
import { BlockInput } from "@/lib/routine-schemas";

const LOG_SOURCE = "routine-blocks-api";

/**
 * POST /api/routine/blocks — a new block. Without layerId it goes to the
 * user's first layer, created as « Semaine type » on first use.
 */
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const parsed = BlockInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message },
      { status: 400 }
    );
  }
  const { layerId, ...data } = parsed.data;

  const layer = layerId
    ? await prisma.calendarLayer.findFirst({
        where: { id: layerId, userId: auth.userId },
      })
    : ((await prisma.calendarLayer.findFirst({
        where: { userId: auth.userId },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      })) ??
      (await prisma.calendarLayer.create({
        data: { userId: auth.userId, name: "Semaine type" },
      })));
  if (!layer)
    return NextResponse.json({ error: "Calque introuvable" }, { status: 404 });

  const count = await prisma.routineBlock.count({
    where: { layerId: layer.id },
  });
  const block = await prisma.routineBlock.create({
    data: { ...data, layerId: layer.id, sortOrder: count },
  });
  return NextResponse.json(block, { status: 201 });
}
