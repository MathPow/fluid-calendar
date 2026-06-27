import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { revertCommand } from "@/lib/recordings/command";

const LOG_SOURCE = "voice-command-revert-route";

export const dynamic = "force-dynamic";

/** POST /api/voice/commands/[id]/revert — undo what a command did. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;

  const { id } = await params;
  const result = await revertCommand(auth.userId, id);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
