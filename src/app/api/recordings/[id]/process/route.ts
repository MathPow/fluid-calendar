import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/prisma";
import { enqueueProcessing } from "@/lib/recordings/pipeline";

const LOG_SOURCE = "recordings-process-route";

export const runtime = "nodejs";

/**
 * POST /api/recordings/[id]/process — (re)run the transcription + summary
 * pipeline for one recording. Used by the UI to retry after an error or to
 * regenerate. Clears the summary only when regenerating from scratch is asked
 * via ?regenerate=1; otherwise it just fills in whatever is missing.
 */
export async function POST(
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

  const regenerate =
    request.nextUrl.searchParams.get("regenerate") === "1";

  await prisma.recording.update({
    where: { id },
    data: {
      status: "pending",
      statusError: null,
      ...(regenerate ? { summary: null } : {}),
    },
  });
  enqueueProcessing(id);

  return NextResponse.json({ status: "processing" });
}
