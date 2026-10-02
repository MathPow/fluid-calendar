import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { SendInput } from "@/lib/facturation/schemas";
import { sendIssuedInvoice } from "@/lib/facturation/service";
import { logger } from "@/lib/logger";

const LOG_SOURCE = "facturation-send-api";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/facturation/invoices/[id]/send — email the PDF, mark it sent. */
export async function POST(request: NextRequest, { params }: Ctx) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const parsed = SendInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
  }
  try {
    return NextResponse.json(await sendIssuedInvoice(auth.userId, id, parsed.data));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("Failed to send invoice", { id, error: message }, LOG_SOURCE);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
