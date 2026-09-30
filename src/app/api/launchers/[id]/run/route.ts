import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { requireStepUp } from "@/lib/auth/step-up";
import { DESKTOP_ACTIONS, type DesktopAction } from "@/lib/desktop-actions";
import { isPromptKind } from "@/lib/launchers";
import { runMachineAction } from "@/lib/machine-actions";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "launcher-run-api";

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/launchers/[id]/run — queue the button on its machine.
 * `shell` kinds still ride through the desktop agent's zenity confirmation.
 * Prompt kinds fire-and-forget: the row's lastRunAt/lastResult fill in
 * when the command finishes, and the caller gets a runId right away. */
export async function POST(request: NextRequest, { params }: Ctx) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const stepUp = requireStepUp(request, auth.userId);
  if (stepUp) return stepUp;
  const { id } = await params;
  const launcher = await prisma.launchShortcut.findFirst({
    where: { id, userId: auth.userId },
    select: {
      id: true,
      kind: true,
      action: true,
      args: true,
      promptText: true,
      machine: {
        select: {
          id: true,
          name: true,
          label: true,
          host: true,
          ip: true,
          sshUser: true,
          sshKey: true,
          agentTokenHash: true,
          agentSeenAt: true,
        },
      },
    },
  });
  if (!launcher)
    return NextResponse.json({ error: "Introuvable" }, { status: 404 });

  if (isPromptKind(launcher.kind)) {
    if (!launcher.machine)
      return NextResponse.json(
        { error: "Ce raccourci n'a plus de machine." },
        { status: 409 }
      );
    const result = await runMachineAction({
      id: launcher.id,
      kind: launcher.kind,
      promptText: launcher.promptText,
      machine: launcher.machine,
    });
    if (!result.ok)
      return NextResponse.json({ error: result.error }, { status: 409 });
    return NextResponse.json(
      {
        ok: true,
        runId: result.runId,
        via: result.via,
        machine: launcher.machine.label || launcher.machine.name,
      },
      { status: 202 }
    );
  }

  // Shell kind — legacy DesktopCommand path, needs an online agent.
  if (!launcher.machine)
    return NextResponse.json(
      { error: "Machine manquante." },
      { status: 409 }
    );
  if (!launcher.machine.agentTokenHash) {
    return NextResponse.json(
      {
        error: `Aucun agent sur ${launcher.machine.label || launcher.machine.name}.`,
      },
      { status: 409 }
    );
  }
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
