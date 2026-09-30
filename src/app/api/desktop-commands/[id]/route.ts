import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { expireCommands } from "@/lib/desktop-agent";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "desktop-command-api";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/desktop-commands/[id] — where a sent command is at. */
export async function GET(request: NextRequest, { params }: Ctx) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const cmd = await prisma.desktopCommand.findUnique({
    where: { id },
    select: { machineId: true, status: true, output: true, error: true },
  });
  if (!cmd) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  if (cmd.status === "queued" || cmd.status === "running")
    await expireCommands(cmd.machineId);
  const fresh = await prisma.desktopCommand.findUnique({
    where: { id },
    select: { status: true, output: true, error: true },
  });
  return NextResponse.json(fresh);
}
