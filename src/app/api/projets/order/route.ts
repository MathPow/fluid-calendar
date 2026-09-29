import { NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "projets-order-api";

const OrderInput = z.object({
  ids: z.array(z.string().min(1)).min(1).max(300),
});

/**
 * PUT /api/projets/order — the projects of one organisation in the order the
 * user wants them (Projets board and dashboard list).
 */
export async function PUT(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const parsed = OrderInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Ordre invalide" }, { status: 400 });
  }
  await prisma.$transaction(
    parsed.data.ids.map((id, i) =>
      prisma.agentProject.updateMany({ where: { id }, data: { sortOrder: i } })
    )
  );
  return NextResponse.json({ ok: true });
}
