import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { recurringData, recurringView } from "@/lib/facturation/recurring";
import { RecurringInput } from "@/lib/facturation/schemas";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "facturation-recurring-item-api";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const Toggle = z.object({ active: z.boolean() });

/** PATCH /api/facturation/recurring/[id] — `{ active }` to pause/resume, or a full RecurringInput. */
export async function PATCH(request: NextRequest, { params }: Ctx) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const body = await request.json().catch(() => null);

  const toggle = Toggle.strict().safeParse(body);
  const parsed = toggle.success ? null : RecurringInput.safeParse(body);
  if (!toggle.success && !parsed?.success) {
    return NextResponse.json({ error: "Invalid body", details: parsed?.error.flatten() }, { status: 400 });
  }
  const row = await prisma.recurringInvoice
    .update({
      where: { id },
      data: toggle.success ? { active: toggle.data.active, lastError: null } : recurringData(parsed!.data!),
    })
    .catch(() => null);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(recurringView(row));
}

/** DELETE /api/facturation/recurring/[id] — the invoices already issued stay. */
export async function DELETE(request: NextRequest, { params }: Ctx) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const { id } = await params;
  await prisma.recurringInvoice.delete({ where: { id } }).catch(() => null);
  return new NextResponse(null, { status: 204 });
}
