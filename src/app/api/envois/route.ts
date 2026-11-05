import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { campaignErrorResponse } from "@/lib/envois/http";
import { CreateCampaignInput } from "@/lib/envois/schemas";
import { createCampaign, listCampaigns } from "@/lib/envois/service";

const LOG_SOURCE = "envois-api";

export const dynamic = "force-dynamic";

/** GET /api/envois — every mass send, with its counters. */
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  try {
    return NextResponse.json(await listCampaigns(auth.userId));
  } catch (error) {
    return campaignErrorResponse(error, LOG_SOURCE);
  }
}

/** POST /api/envois — create a draft from a CSV of personalised messages. Sends nothing. */
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const parsed = CreateCampaignInput.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  try {
    return NextResponse.json(await createCampaign(auth.userId, parsed.data), {
      status: 201,
    });
  } catch (error) {
    return campaignErrorResponse(error, LOG_SOURCE);
  }
}
