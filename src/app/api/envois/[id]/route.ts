import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { campaignErrorResponse } from "@/lib/envois/http";
import { PatchCampaignInput } from "@/lib/envois/schemas";
import {
  deleteCampaign,
  getCampaign,
  updateCampaign,
} from "@/lib/envois/service";

const LOG_SOURCE = "envois-campaign-api";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/envois/[id] — the campaign, its messages and what would stop it from starting. */
export async function GET(request: NextRequest, { params }: Ctx) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const { id } = await params;
  try {
    return NextResponse.json(await getCampaign(auth.userId, id));
  } catch (error) {
    return campaignErrorResponse(error, LOG_SOURCE);
  }
}

/** PATCH /api/envois/[id] — name, sender, footer, pace. */
export async function PATCH(request: NextRequest, { params }: Ctx) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const parsed = PatchCampaignInput.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  try {
    await updateCampaign(auth.userId, id, parsed.data);
    return NextResponse.json(await getCampaign(auth.userId, id));
  } catch (error) {
    return campaignErrorResponse(error, LOG_SOURCE);
  }
}

/** DELETE /api/envois/[id] — only a campaign that sent nothing. */
export async function DELETE(request: NextRequest, { params }: Ctx) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const { id } = await params;
  try {
    await deleteCampaign(auth.userId, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return campaignErrorResponse(error, LOG_SOURCE);
  }
}
