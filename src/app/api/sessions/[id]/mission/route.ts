import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/prisma";
import { renderMission } from "@/lib/sessions/mission";
import { buildTimeline, timelineDuration } from "@/lib/sessions/timeline";
import { parseTargets } from "@/lib/sessions/types";

const LOG_SOURCE = "sessions-mission-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/sessions/[id]/mission — the compiled mission as Markdown.
 *
 * This is what the "copy for Claude" button on the page returns, and the same
 * text the MCP `get_mission` tool serves. Levels 1 and 2 only — the transcript
 * is fetched separately via get_segment / search_transcript.
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
    include: {
      recordings: {
        orderBy: { orderIndex: "asc" },
        select: { id: true, title: true, orderIndex: true, durationSec: true },
      },
    },
  });
  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const timeline = buildTimeline(session.recordings);
  const markdown = renderMission({
    id: session.id,
    title: session.title,
    brief: session.brief,
    digest: session.digest,
    toc: session.toc,
    lexicon: session.lexicon,
    language: session.language,
    targets: parseTargets(session.targets),
    timeline,
    totalDurationSec: timelineDuration(timeline),
    createdAt: session.createdAt,
  });

  return new NextResponse(markdown, {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
