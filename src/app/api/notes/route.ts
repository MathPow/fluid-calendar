import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";
import { isNotesConfigured, listVault } from "@/lib/notes/webdav";

const LOG_SOURCE = "notes-route";

/** GET /api/notes — list the Obsidian vault tree (folders + text notes). */
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) {
    return auth.response;
  }

  if (!isNotesConfigured()) {
    return NextResponse.json({ configured: false, entries: [] });
  }

  try {
    const entries = await listVault();
    return NextResponse.json({
      configured: true,
      entries,
      // Obsidian vault name, used to build obsidian:// deep-links in the UI.
      vault: process.env.OBSIDIAN_VAULT_NAME ?? null,
    });
  } catch (error) {
    logger.error(
      "Failed to load notes",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Failed to reach the Obsidian vault" },
      { status: 502 }
    );
  }
}
