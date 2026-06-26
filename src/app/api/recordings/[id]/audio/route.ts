import { createReadStream, existsSync, statSync } from "fs";
import { Readable } from "stream";

import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/prisma";
import { recordingAbsPath } from "@/lib/recordings/storage";

const LOG_SOURCE = "recordings-audio-route";

export const runtime = "nodejs";

/**
 * GET /api/recordings/[id]/audio — stream the audio bytes for playback.
 * Supports HTTP Range so the <audio> element can seek. Auth is via the NextAuth
 * session cookie, which the browser sends automatically on media requests.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;

  const { id } = await params;
  const recording = await prisma.recording.findFirst({
    where: { id, userId: auth.userId },
    select: { storagePath: true, mimeType: true, fileName: true },
  });
  if (!recording?.storagePath) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const abs = recordingAbsPath(recording.storagePath);
  if (!existsSync(abs)) {
    return NextResponse.json({ error: "Audio file missing" }, { status: 404 });
  }

  const size = statSync(abs).size;
  const contentType = recording.mimeType || "audio/mp4";
  const range = request.headers.get("range");

  if (range) {
    const match = /bytes=(\d*)-(\d*)/.exec(range);
    const start = match && match[1] ? Number.parseInt(match[1], 10) : 0;
    const end = match && match[2] ? Number.parseInt(match[2], 10) : size - 1;
    if (start >= size || end >= size || start > end) {
      return new NextResponse(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${size}` },
      });
    }
    const stream = createReadStream(abs, { start, end });
    return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
      status: 206,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(end - start + 1),
        "Content-Range": `bytes ${start}-${end}/${size}`,
        "Accept-Ranges": "bytes",
      },
    });
  }

  const stream = createReadStream(abs);
  return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(size),
      "Accept-Ranges": "bytes",
    },
  });
}
