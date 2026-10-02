import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { isoDay } from "@/lib/facturation/meta";
import { recurringView } from "@/lib/facturation/recurring";
import { issueFromRecurring } from "@/lib/facturation/service";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "facturation-recurring-run-api";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/facturation/recurring/[id]/run — issue (and auto-send) one
 * invoice today, outside the schedule. The next scheduled date doesn't move.
 */
export async function POST(request: NextRequest, { params }: Ctx) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const rec = await prisma.recurringInvoice.findUnique({ where: { id } });
  if (!rec) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const result = await issueFromRecurring(rec, isoDay(new Date()));
    const updated = await prisma.recurringInvoice.findUniqueOrThrow({ where: { id } });
    return NextResponse.json({ ...result, recurring: recurringView(updated) });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("Manual recurring run failed", { id, error: message }, LOG_SOURCE);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
