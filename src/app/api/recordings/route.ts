import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { authenticateUpload } from "@/lib/auth/ingest-auth";
import { newDate } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { enqueueProcessing } from "@/lib/recordings/pipeline";
import { prisma } from "@/lib/prisma";
import { saveRecordingFile } from "@/lib/recordings/storage";

const LOG_SOURCE = "recordings-route";

// Audio uploads can be tens of MB; run on the Node runtime and don't cache.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/recordings — list the signed-in user's recordings (metadata only,
 * no audio bytes or full transcript). Used by the dashboard Recordings view.
 */
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;

  try {
    const recordings = await prisma.recording.findMany({
      where: { userId: auth.userId },
      orderBy: { recordedAt: "desc" },
      select: {
        id: true,
        title: true,
        source: true,
        fileName: true,
        mimeType: true,
        sizeBytes: true,
        durationSec: true,
        summary: true,
        transcript: true,
        status: true,
        statusError: true,
        language: true,
        recordedAt: true,
        createdAt: true,
      },
    });

    // Don't ship full transcripts in the list — just a flag. The detail route
    // returns the transcript when a recording is opened.
    return NextResponse.json({
      recordings: recordings.map(({ transcript, ...r }) => ({
        ...r,
        hasTranscript: Boolean(transcript),
      })),
    });
  } catch (error) {
    logger.error(
      "Failed to list recordings",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Failed to load recordings" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/recordings — ingest a recording from a capture client.
 * Auth: X-Api-Key header (see authenticateIngest).
 * Body: multipart/form-data with:
 *   file        (required) the audio file
 *   title       (optional) defaults to the filename
 *   source      (optional) "meetily" | "watch" | "upload"
 *   transcript  (optional) full transcript text
 *   summary     (optional) short summary
 *   recordedAt  (optional) ISO timestamp of capture
 *   durationSec (optional) integer seconds
 */
export async function POST(request: NextRequest) {
  const auth = await authenticateUpload(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected multipart/form-data" },
      { status: 400 }
    );
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing 'file'" }, { status: 400 });
  }

  const fileName = file.name || "recording.m4a";
  const str = (key: string): string | undefined => {
    const v = form.get(key);
    return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
  };

  const durationRaw = str("durationSec");
  const durationSec = durationRaw ? Number.parseInt(durationRaw, 10) : undefined;
  const recordedAtRaw = str("recordedAt");
  const recordedAt = recordedAtRaw ? new Date(recordedAtRaw) : newDate();

  const transcript = str("transcript") ?? null;
  const summary = str("summary") ?? null;
  // If the client didn't already provide both, canardo transcribes/summarizes.
  const needsProcessing = !transcript || !summary;

  try {
    const created = await prisma.recording.create({
      data: {
        userId: auth.userId,
        title: str("title") ?? fileName.replace(/\.[^.]+$/, ""),
        source: str("source") ?? "upload",
        fileName,
        storagePath: "", // set after we know the id
        mimeType: file.type || "audio/mp4",
        sizeBytes: file.size,
        durationSec:
          durationSec !== undefined && Number.isFinite(durationSec)
            ? durationSec
            : null,
        transcript,
        summary,
        status: needsProcessing ? "pending" : "done",
        recordedAt: Number.isNaN(recordedAt.getTime()) ? newDate() : recordedAt,
      },
    });

    const buffer = Buffer.from(await file.arrayBuffer());
    const storagePath = await saveRecordingFile(created.id, fileName, buffer);
    await prisma.recording.update({
      where: { id: created.id },
      data: { storagePath },
    });

    // Kick off transcription + summary in the background; respond immediately
    // so the capture client never blocks on the (slow, CPU-bound) pipeline.
    if (needsProcessing) enqueueProcessing(created.id);

    logger.info(
      "Recording ingested",
      {
        id: created.id,
        source: created.source,
        bytes: file.size,
        willProcess: needsProcessing,
      },
      LOG_SOURCE
    );
    return NextResponse.json(
      {
        id: created.id,
        title: created.title,
        status: needsProcessing ? "processing" : "stored",
      },
      { status: 201 }
    );
  } catch (error) {
    logger.error(
      "Failed to ingest recording",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Failed to store recording" },
      { status: 500 }
    );
  }
}
