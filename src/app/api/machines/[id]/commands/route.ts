import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { requireStepUp } from "@/lib/auth/step-up";
import { CommandInput } from "@/lib/desktop-actions";
import { expireCommands } from "@/lib/desktop-agent";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "desktop-commands-api";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const commandSelect = {
  id: true,
  action: true,
  args: true,
  status: true,
  output: true,
  error: true,
  createdAt: true,
  finishedAt: true,
} as const;

/** GET /api/machines/[id]/commands — the agent's state and the latest commands. */
export async function GET(request: NextRequest, { params }: Ctx) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const { id } = await params;
  await expireCommands(id);
  const [machine, commands] = await Promise.all([
    prisma.machine.findUnique({
      where: { id },
      select: { agentSeenAt: true, agentTokenHash: true },
    }),
    prisma.desktopCommand.findMany({
      where: { machineId: id },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: commandSelect,
    }),
  ]);
  if (!machine)
    return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  return NextResponse.json({
    agent: { connected: !!machine.agentTokenHash, seenAt: machine.agentSeenAt },
    commands,
  });
}

/** POST /api/machines/[id]/commands — `{ action, args }` for the machine's agent. */
export async function POST(request: NextRequest, { params }: Ctx) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const stepUp = requireStepUp(request, auth.userId);
  if (stepUp) return stepUp;
  const { id } = await params;
  const parsed = CommandInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Commande invalide" },
      { status: 400 }
    );
  }
  const machine = await prisma.machine.findUnique({
    where: { id },
    select: { agentTokenHash: true },
  });
  if (!machine)
    return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  if (!machine.agentTokenHash) {
    return NextResponse.json(
      { error: "Aucun agent connecté à cette machine." },
      { status: 409 }
    );
  }
  const command = await prisma.desktopCommand.create({
    data: {
      machineId: id,
      action: parsed.data.action,
      args: parsed.data.args as object,
    },
    select: commandSelect,
  });
  return NextResponse.json(command, { status: 201 });
}
