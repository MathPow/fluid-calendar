import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { newDate } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { saveRecordingFile } from "@/lib/recordings/storage";

const LOG_SOURCE = "sessions-audio-route";

// Multi-hour calls are large uploads; Node runtime, never cached.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/sessions/[id]/audio — attach one or more audio files to a session.
 * Body: multipart/form-data with one or many `file` fields.
 *
 * Files are appended in the order given, after any already attached — the
 * session timeline is built from that order, so it decides what "1:47:20" means.
 * Nothing is transcribed here; that happens on compile, once the lexicon is set.
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
    select: { id: true },
  });
  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }

  const files = form.getAll("file").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "Missing 'file'" }, { status: 400 });
  }

  const last = await prisma.recording.findFirst({
    where: { sessionId: id },
    orderBy: { orderIndex: "desc" },
    select: { orderIndex: true },
  });
  let nextIndex = (last?.orderIndex ?? -1) + 1;

  const created: Array<{ id: string; title: string }> = [];
  try {
    for (const file of files) {
      const fileName = file.name || "recording.m4a";
      const row = await prisma.recording.create({
        data: {
          userId: auth.userId,
          sessionId: id,
          orderIndex: nextIndex++,
          title: fileName.replace(/\.[^.]+$/, ""),
          source: "upload",
          fileName,
          storagePath: "", // set below, once we have the id
          mimeType: file.type || "audio/mp4",
          sizeBytes: file.size,
          // Transcription is deferred to compile, so the lexicon applies.
          status: "pending",
          recordedAt: newDate(),
        },
      });

      const buffer = Buffer.from(await file.arrayBuffer());
      const storagePath = await saveRecordingFile(row.id, fileName, buffer);
      await prisma.recording.update({ where: { id: row.id }, data: { storagePath } });
      created.push({ id: row.id, title: row.title });
    }

    // Attaching audio invalidates a previous compile — the digest no longer
    // covers everything in the session.
    await prisma.workSession.updateMany({
      where: { id, status: "ready" },
      data: { status: "draft" },
    });

    logger.info("Session audio attached", { id, count: created.length }, LOG_SOURCE);
    return NextResponse.json({ recordings: created }, { status: 201 });
  } catch (error) {
    logger.error(
      "Failed to attach session audio",
      { id, error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json({ error: "Failed to store audio" }, { status: 500 });
  }
}
