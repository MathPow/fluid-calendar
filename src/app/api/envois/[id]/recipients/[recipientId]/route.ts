import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { campaignErrorResponse } from "@/lib/envois/http";
import { PatchRecipientInput } from "@/lib/envois/schemas";
import { getCampaign, updateRecipient } from "@/lib/envois/service";

const LOG_SOURCE = "envois-recipient-api";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; recipientId: string }> };

/** PATCH /api/envois/[id]/recipients/[recipientId] — edit, tick or requeue one message. */
export async function PATCH(request: NextRequest, { params }: Ctx) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const { id, recipientId } = await params;
  const parsed = PatchRecipientInput.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  try {
    await updateRecipient(auth.userId, id, recipientId, parsed.data);
    return NextResponse.json(await getCampaign(auth.userId, id));
  } catch (error) {
    return campaignErrorResponse(error, LOG_SOURCE);
  }
}
