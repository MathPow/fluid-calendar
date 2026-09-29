import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/prisma";
import { BlockInput } from "@/lib/routine-schemas";

const LOG_SOURCE = "routine-block-api";

type Ctx = { params: Promise<{ id: string }> };

// The refine() on BlockInput needs both times; a partial update is checked
// against the stored block instead.
const BlockPatch = BlockInput.innerType().partial();

async function ownedBlock(id: string, userId: string) {
  return prisma.routineBlock.findFirst({ where: { id, layer: { userId } } });
}

/** PATCH /api/routine/blocks/[id] — any subset of the block's fields. */
export async function PATCH(request: NextRequest, { params }: Ctx) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const parsed = BlockPatch.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message },
      { status: 400 }
    );
  }
  const current = await ownedBlock(id, auth.userId);
  if (!current)
    return NextResponse.json({ error: "Introuvable" }, { status: 404 });

  const { layerId, ...data } = parsed.data;
  const merged = { ...current, ...data };
  if (merged.startTime === merged.endTime) {
    return NextResponse.json(
      { error: "Le bloc doit durer plus de zéro minute" },
      { status: 400 }
    );
  }
  if (layerId) {
    const layer = await prisma.calendarLayer.findFirst({
      where: { id: layerId, userId: auth.userId },
    });
    if (!layer)
      return NextResponse.json(
        { error: "Calque introuvable" },
        { status: 404 }
      );
  }

  const block = await prisma.routineBlock.update({
    where: { id },
    data: { ...data, ...(layerId ? { layerId } : {}) },
  });
  return NextResponse.json(block);
}

/** DELETE /api/routine/blocks/[id] */
export async function DELETE(request: NextRequest, { params }: Ctx) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const current = await ownedBlock(id, auth.userId);
  if (!current)
    return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  await prisma.routineBlock.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
