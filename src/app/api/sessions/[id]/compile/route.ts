import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/prisma";
import { enqueueSession, isQueued } from "@/lib/sessions/pipeline";

const LOG_SOURCE = "sessions-compile-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/sessions/[id]/compile — transcribe every attached audio with the
 * session's lexicon, then build the digest + table of contents.
 *
 * Returns immediately; the work runs on a background queue (hours of audio on
 * one GPU). Poll GET /api/sessions/[id] for status.
 *
 * ?force=1 re-transcribes recordings that already have segments — use it after
 * editing the lexicon, since the lexicon only takes effect during decoding.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;

  const { id } = await params;
  const session = await prisma.workSession.findFirst({
    where: { id, userId: auth.userId },
    select: { id: true, status: true, _count: { select: { recordings: true } } },
  });
  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (session._count.recordings === 0) {
    return NextResponse.json(
      { error: "Ajoute au moins un fichier audio avant de compiler." },
      { status: 400 }
    );
  }
  if (isQueued(id) || session.status === "processing") {
    return NextResponse.json({ status: "processing" });
  }

  const force = new URL(request.url).searchParams.get("force") === "1";
  if (force) {
    // Drop existing segments so the lexicon is applied from scratch.
    await prisma.transcriptSegment.deleteMany({
      where: { recording: { sessionId: id } },
    });
    await prisma.recording.updateMany({
      where: { sessionId: id },
      data: { transcript: null, status: "pending", statusError: null },
    });
  }

  await prisma.workSession.update({
    where: { id },
    data: { status: "processing", statusError: null },
  });
  enqueueSession(id);

  return NextResponse.json({ status: "processing" });
}
