import { NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { campaignErrorResponse } from "@/lib/envois/http";
import { answerReply, getCampaign } from "@/lib/envois/service";

const LOG_SOURCE = "envois-reply-api";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string; recipientId: string }> };

const Body = z.object({ text: z.string().min(1).max(20_000) });

/**
 * POST /api/envois/[id]/recipients/[recipientId]/reply — answer the person's
 * reply from the campaign's account, in the same thread.
 */
export async function POST(request: NextRequest, { params }: Ctx) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const { id, recipientId } = await params;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  try {
    const { to } = await answerReply(
      auth.userId,
      id,
      recipientId,
      parsed.data.text
    );
    return NextResponse.json({
      to,
      campaign: await getCampaign(auth.userId, id),
    });
  } catch (error) {
    return campaignErrorResponse(error, LOG_SOURCE);
  }
}
