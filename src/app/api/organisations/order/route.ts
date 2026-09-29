import { NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "organisations-order-api";

const OrderInput = z.object({
  ids: z.array(z.string().min(1)).min(1).max(200),
});

/**
 * PUT /api/organisations/order — the organisations in the order the user
 * wants them everywhere (Projets, calendar sidebar, Tasks). Ids not listed
 * keep their place after the listed ones.
 */
export async function PUT(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const parsed = OrderInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Ordre invalide" }, { status: 400 });
  }
  const { ids } = parsed.data;
  await prisma.$transaction(
    ids.map((id, i) =>
      prisma.organisation.updateMany({ where: { id }, data: { sortOrder: i } })
    )
  );
  return NextResponse.json({ ok: true });
}
