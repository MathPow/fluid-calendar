import { NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { deleteRecordingFile } from "@/lib/recordings/storage";
import { buildTimeline, timelineDuration } from "@/lib/sessions/timeline";
import { TargetsSchema, parseTargets } from "@/lib/sessions/types";

const LOG_SOURCE = "sessions-id-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UpdateSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  lexicon: z.string().max(20000).nullable().optional(),
  language: z.string().trim().max(10).nullable().optional(),
  model: z.string().trim().max(200).nullable().optional(),
  brief: z.string().max(50000).nullable().optional(),
  targets: TargetsSchema.optional(),
});

/** GET /api/sessions/[id] — full session incl. digest, toc, and its recordings. */
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
        select: {
          id: true,
          title: true,
          fileName: true,
          sizeBytes: true,
          durationSec: true,
          status: true,
          statusError: true,
          orderIndex: true,
          language: true,
          _count: { select: { segments: true } },
        },
      },
    },
  });
  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const timeline = buildTimeline(session.recordings);

  return NextResponse.json({
    session: {
      ...session,
      targets: parseTargets(session.targets),
      totalDurationSec: timelineDuration(timeline),
      recordings: session.recordings.map((r) => {
        const { _count, ...rest } = r;
        return {
          ...rest,
          segmentCount: _count.segments,
          offsetSec: timeline.find((t) => t.recordingId === r.id)?.offsetSec ?? 0,
        };
      }),
    },
  });
}

/** PATCH /api/sessions/[id] — edit lexicon, brief, targets, title, language, model. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;

  const { id } = await params;
  const existing = await prisma.workSession.findFirst({
    where: { id, userId: auth.userId },
    select: { id: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected JSON body" }, { status: 400 });
  }

  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid update", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const session = await prisma.workSession.update({
      where: { id },
      data: {
        ...parsed.data,
        // Prisma's Json column wants undefined (not null) to mean "leave alone".
        targets: parsed.data.targets ?? undefined,
      },
    });
    return NextResponse.json({ session });
  } catch (error) {
    logger.error(
      "Failed to update session",
      { id, error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json({ error: "Failed to update session" }, { status: 500 });
  }
}

/** DELETE /api/sessions/[id] — remove the session, its recordings and audio files. */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;

  const { id } = await params;
  const session = await prisma.workSession.findFirst({
    where: { id, userId: auth.userId },
    include: { recordings: { select: { id: true, storagePath: true } } },
  });
  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    for (const rec of session.recordings) {
      if (rec.storagePath) await deleteRecordingFile(rec.storagePath);
    }
    // Recordings cascade-delete their segments; the session's FK is SetNull, so
    // delete the rows explicitly rather than orphaning them.
    await prisma.recording.deleteMany({ where: { sessionId: id } });
    await prisma.workSession.delete({ where: { id } });
    return NextResponse.json({ status: "deleted" });
  } catch (error) {
    logger.error(
      "Failed to delete session",
      { id, error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json({ error: "Failed to delete session" }, { status: 500 });
  }
}
