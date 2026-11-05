import { NextResponse } from "next/server";

import { logger } from "@/lib/logger";

import { CampaignError } from "./service";

/** Campaign errors carry their own status; anything else is logged as a 500. */
export function campaignErrorResponse(error: unknown, source: string) {
  if (error instanceof CampaignError) {
    return NextResponse.json(
      { error: error.message, details: error.details },
      { status: error.status }
    );
  }
  const message = error instanceof Error ? error.message : String(error);
  logger.error("Campaign request failed", { error: message }, source);
  return NextResponse.json({ error: message }, { status: 500 });
}
