import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { hashAgentToken, newAgentToken } from "@/lib/desktop-agent";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "desktop-agent-token-api";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/machines/[id]/agent — a new token for this machine's desktop
 * agent (replaces the old one). Shown once; only its hash is stored.
 */
export async function POST(request: NextRequest, { params }: Ctx) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const token = newAgentToken();
  const machine = await prisma.machine
    .update({
      where: { id },
      data: { agentTokenHash: hashAgentToken(token), agentSeenAt: null },
      select: { name: true },
    })
    .catch(() => null);
  if (!machine)
    return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  return NextResponse.json({ token, machine: machine.name });
}

/** DELETE /api/machines/[id]/agent — disconnect the agent (its token stops working). */
export async function DELETE(request: NextRequest, { params }: Ctx) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const { id } = await params;
  await prisma.machine.updateMany({
    where: { id },
    data: { agentTokenHash: null, agentSeenAt: null },
  });
  await prisma.desktopCommand.updateMany({
    where: { machineId: id, status: { in: ["queued", "running"] } },
    data: {
      status: "failed",
      error: "Agent déconnecté.",
      finishedAt: new Date(),
    },
  });
  return NextResponse.json({ ok: true });
}
