import { NextRequest, NextResponse } from "next/server";

import { agentMachine, expireCommands } from "@/lib/desktop-agent";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const WAIT_MS = 25_000;
const STEP_MS = 800;

/**
 * POST /api/agent/claim — a desktop agent (Bearer token) asks for work. Holds
 * the request up to 25 s until a command is queued for its machine (long
 * poll), then hands it over as « running ». 204 when nothing came.
 */
export async function POST(request: NextRequest) {
  const machine = await agentMachine(request);
  if (!machine) return new NextResponse("Unauthorized", { status: 401 });
  await prisma.machine.update({
    where: { id: machine.id },
    data: { agentSeenAt: new Date() },
  });
  await expireCommands(machine.id);

  const deadline = Date.now() + WAIT_MS;
  while (Date.now() < deadline && !request.signal.aborted) {
    const next = await prisma.desktopCommand.findFirst({
      where: { machineId: machine.id, status: "queued" },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (next) {
      const { count } = await prisma.desktopCommand.updateMany({
        where: { id: next.id, status: "queued" },
        data: { status: "running", startedAt: new Date() },
      });
      if (count === 1) {
        const cmd = await prisma.desktopCommand.findUniqueOrThrow({
          where: { id: next.id },
          select: { id: true, action: true, args: true },
        });
        return NextResponse.json(cmd);
      }
      continue;
    }
    await new Promise((r) => setTimeout(r, STEP_MS));
  }
  return new NextResponse(null, { status: 204 });
}
