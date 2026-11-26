import { NextRequest, NextResponse } from "next/server";

import { jsonError } from "@/lib/api-errors";
import { authenticateRequest } from "@/lib/auth/api-auth";
import { requireStepUp } from "@/lib/auth/step-up";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { machineSelect } from "@/lib/projets/queries";
import { MachineInput, machineFields } from "@/lib/projets/schemas";

const LOG_SOURCE = "machines-api";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** PATCH /api/machines/[id] — rename, relabel, or set the terminal and stats addresses. */
export async function PATCH(request: NextRequest, { params }: Ctx) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const stepUp = requireStepUp(request, auth.userId);
  if (stepUp) return stepUp;
  const { id } = await params;
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return jsonError("api.errors.invalidJson", 400);
  }
  const parsed = MachineInput.partial().safeParse(json);
  if (!parsed.success) {
    return jsonError("api.errors.invalidBody", 400, undefined, {
      details: parsed.error.flatten(),
    });
  }
  const f = parsed.data;
  try {
    const machine = await prisma.machine.update({
      where: { id },
      data: {
        ...(f.name !== undefined ? { name: f.name } : {}),
        ...machineFields(f),
      },
      select: machineSelect,
    });
    return NextResponse.json(machine);
  } catch (error) {
    logger.error(
      "Failed to update machine",
      { id, error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return jsonError("api.errors.orgUpdateFailed", 500);
  }
}

/** DELETE /api/machines/[id] — also forgets the project locations on it. */
export async function DELETE(request: NextRequest, { params }: Ctx) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const { id } = await params;
  try {
    await prisma.machine.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    logger.error(
      "Failed to delete machine",
      { id, error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return jsonError("api.errors.deleteFailed", 500);
  }
}
