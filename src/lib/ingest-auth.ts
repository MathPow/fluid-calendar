import type { NextRequest } from "next/server";

import { safeEqual } from "@/lib/recordings/storage";

/**
 * Static-token auth for unattended senders (hooks, other apps): the
 * PROJECT_INGEST_TOKEN in `Authorization: Bearer …` or `X-Api-Key`.
 */
export function ingestTokenOk(request: NextRequest): boolean {
  const expected = process.env.PROJECT_INGEST_TOKEN;
  if (!expected) return false;
  const bearer = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "");
  const provided = bearer || request.headers.get("x-api-key") || "";
  return provided.length > 0 && safeEqual(provided, expected);
}
