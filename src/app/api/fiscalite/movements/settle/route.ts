import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { movementSelect, toMovementView } from "@/lib/fiscalite/queries";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "fiscalite-movements-settle";

export const dynamic = "force-dynamic";

const Body = z.object({
  organisationId: z.string().min(1),
  from: z.string().trim().min(1).max(80),
  to: z.string().trim().min(1).max(80),
  amountCents: z.number().int().positive().max(100_000_000_00),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide").optional(),
});

/**
 * POST /api/fiscalite/movements/settle — one partner pays another to level
 * their balances. We record this as two movements of the same date, same
 * amount, with a shared « Règlement » note: `from` makes an avance to the
 * SENC, and the SENC reimburses `to`. Both balances drop by `amountCents`.
 */
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
  }
  const { organisationId, from, to, amountCents } = parsed.data;
  if (from === to) {
    return NextResponse.json({ error: "`from` et `to` doivent être différents" }, { status: 400 });
  }
  const date = new Date(`${parsed.data.date ?? new Date().toISOString().slice(0, 10)}T00:00:00Z`);
  const notes = `Règlement entre ${from} et ${to}`;

  const rows = await prisma.$transaction([
    prisma.partnerMovement.create({
      data: { organisationId, date, kind: "avance", partner: from, amountCents, notes },
      select: movementSelect,
    }),
    prisma.partnerMovement.create({
      data: { organisationId, date, kind: "remboursement", partner: to, amountCents, notes },
      select: movementSelect,
    }),
  ]);
  return NextResponse.json(rows.map(toMovementView), { status: 201 });
}
