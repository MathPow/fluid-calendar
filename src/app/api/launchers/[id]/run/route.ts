import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { DESKTOP_ACTIONS, type DesktopAction } from "@/lib/desktop-actions";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "launcher-run-api";

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/launchers/[id]/run — queue the button's command for its machine's agent. */
export async function POST(request: NextRequest, { params }: Ctx) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const launcher = await prisma.launchShortcut.findFirst({
    where: { id, userId: auth.userId },
    select: {
      action: true,
      args: true,
      machine: {
        select: { id: true, name: true, label: true, agentTokenHash: true },
      },
    },
  });
  if (!launcher)
    return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  if (!launcher.machine.agentTokenHash) {
    return NextResponse.json(
      {
        error: `Aucun agent sur ${launcher.machine.label || launcher.machine.name}.`,
      },
      { status: 409 }
    );
  }
  // Re-check the saved args against today's rules before they reach the agent.
  const def = DESKTOP_ACTIONS[launcher.action as DesktopAction];
  const args = def?.schema.safeParse(launcher.args);
  if (!def || !args?.success) {
    return NextResponse.json(
      { error: "Raccourci invalide, modifie-le." },
      { status: 400 }
    );
  }
  const command = await prisma.desktopCommand.create({
    data: {
      machineId: launcher.machine.id,
      action: launcher.action,
      args: args.data as object,
    },
    select: { id: true },
  });
  return NextResponse.json(
    {
      commandId: command.id,
      machine: launcher.machine.label || launcher.machine.name,
    },
    { status: 201 }
  );
}
