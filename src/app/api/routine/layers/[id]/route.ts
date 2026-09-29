import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/prisma";
import { LayerInput, layerInclude } from "@/lib/routine-schemas";

const LOG_SOURCE = "routine-layer-api";

type Ctx = { params: Promise<{ id: string }> };

/** PATCH /api/routine/layers/[id] — rename or show/hide. */
export async function PATCH(request: NextRequest, { params }: Ctx) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const parsed = LayerInput.partial().safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message },
      { status: 400 }
    );
  }
  const owned = await prisma.calendarLayer.findFirst({
    where: { id, userId: auth.userId },
  });
  if (!owned)
    return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  const layer = await prisma.calendarLayer.update({
    where: { id },
    data: parsed.data,
    include: layerInclude,
  });
  return NextResponse.json(layer);
}

/** DELETE /api/routine/layers/[id] — the layer and all its blocks. */
export async function DELETE(request: NextRequest, { params }: Ctx) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const { id } = await params;
  await prisma.calendarLayer.deleteMany({ where: { id, userId: auth.userId } });
  return NextResponse.json({ ok: true });
}
