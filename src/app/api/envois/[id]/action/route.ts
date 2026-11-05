import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { campaignErrorResponse } from "@/lib/envois/http";
import { CampaignAction } from "@/lib/envois/schemas";
import {
  getCampaign,
  pauseCampaign,
  selectRecipients,
  sendTest,
  startCampaign,
} from "@/lib/envois/service";

const LOG_SOURCE = "envois-action-api";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/envois/[id]/action — start or resume, pause, send a test, tick messages. */
export async function POST(request: NextRequest, { params }: Ctx) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const parsed = CampaignAction.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const input = parsed.data;
  try {
    let test: Awaited<ReturnType<typeof sendTest>> | undefined;
    if (input.action === "start") await startCampaign(auth.userId, id);
    if (input.action === "pause") await pauseCampaign(auth.userId, id);
    if (input.action === "test")
      test = await sendTest(auth.userId, id, input.recipientId, input.to);
    if (input.action === "select")
      await selectRecipients(
        auth.userId,
        id,
        input.selected,
        input.onlyFlagged
      );
    return NextResponse.json({
      campaign: await getCampaign(auth.userId, id),
      test,
    });
  } catch (error) {
    return campaignErrorResponse(error, LOG_SOURCE);
  }
}
