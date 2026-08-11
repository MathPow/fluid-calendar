import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/prisma";
import { getSegmentRange, searchTranscript } from "@/lib/sessions/search";
import { parseTimestamp } from "@/lib/sessions/timeline";

const LOG_SOURCE = "sessions-search-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/sessions/[id]/search — level-3 retrieval from the browser, mirroring
 * what the agent gets over MCP.
 *
 *   ?q=pricing paliers        full-text search, ranked
 *   ?from=1:40:00&to=1:55:00  verbatim for a window of the session timeline
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;

  const { id } = await params;
  const session = await prisma.workSession.findFirst({
    where: { id, userId: auth.userId },
    select: { id: true },
  });
  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const url = new URL(request.url);
  const q = url.searchParams.get("q");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  if (from || to) {
    const fromSec = parseTimestamp(from ?? "0");
    const toSec = parseTimestamp(to ?? "");
    if (fromSec === null || toSec === null) {
      return NextResponse.json(
        { error: "from/to doivent être des timestamps, ex. 1:40:00" },
        { status: 400 }
      );
    }
    const range = await getSegmentRange(prisma, id, fromSec, toSec);
    return NextResponse.json(range);
  }

  if (!q?.trim()) {
    return NextResponse.json({ error: "Fournis ?q= ou ?from=&to=" }, { status: 400 });
  }

  const limitRaw = Number(url.searchParams.get("limit") ?? "15");
  const hits = await searchTranscript(prisma, id, q, {
    limit: Number.isFinite(limitRaw) ? limitRaw : 15,
  });
  return NextResponse.json({ hits });
}
