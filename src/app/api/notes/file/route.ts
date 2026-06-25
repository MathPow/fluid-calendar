import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";
import { readNote } from "@/lib/notes/webdav";

const LOG_SOURCE = "notes-file-route";

/** GET /api/notes/file?path=/Daily/2026-06-24.md — read one note's content. */
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) {
    return auth.response;
  }

  const path = request.nextUrl.searchParams.get("path");
  if (!path) {
    return NextResponse.json({ error: "Missing path" }, { status: 400 });
  }

  try {
    const content = await readNote(path);
    return NextResponse.json({ path, content });
  } catch (error) {
    logger.error(
      "Failed to read note",
      {
        path,
        error: error instanceof Error ? error.message : String(error),
      },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Failed to read note" },
      { status: 502 }
    );
  }
}
