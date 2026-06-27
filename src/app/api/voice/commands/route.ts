import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "voice-commands-route";

export const dynamic = "force-dynamic";

/** GET /api/voice/commands — the user's voice/text command audit log. */
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;

  const commands = await prisma.voiceCommand.findMany({
    where: { userId: auth.userId },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      transcript: true,
      action: true,
      ok: true,
      message: true,
      targetType: true,
      targetId: true,
      reverted: true,
      revertedAt: true,
      createdAt: true,
    },
  });
  return NextResponse.json({ commands });
}
