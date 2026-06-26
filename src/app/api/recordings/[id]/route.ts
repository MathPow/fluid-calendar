import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { deleteRecordingFile } from "@/lib/recordings/storage";

const LOG_SOURCE = "recordings-id-route";

export const runtime = "nodejs";

/** GET /api/recordings/[id] — full recording incl. transcript + summary. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;

  const { id } = await params;
  const recording = await prisma.recording.findFirst({
    where: { id, userId: auth.userId },
  });
  if (!recording) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ recording });
}

/** DELETE /api/recordings/[id] — remove the row and its audio file. */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;

  const { id } = await params;
  const recording = await prisma.recording.findFirst({
    where: { id, userId: auth.userId },
  });
  if (!recording) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    if (recording.storagePath) {
      await deleteRecordingFile(recording.storagePath);
    }
    await prisma.recording.delete({ where: { id: recording.id } });
    return NextResponse.json({ status: "deleted" });
  } catch (error) {
    logger.error(
      "Failed to delete recording",
      { id, error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Failed to delete recording" },
      { status: 500 }
    );
  }
}
