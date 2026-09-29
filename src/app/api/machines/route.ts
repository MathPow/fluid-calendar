import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { MachineInput, machineFields } from "@/lib/projets/schemas";

const LOG_SOURCE = "machines-api";

export const dynamic = "force-dynamic";

/** GET /api/machines — every machine with the projects present on it. */
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const machines = await prisma.machine.findMany({
    orderBy: [{ kind: "asc" }, { name: "asc" }],
    include: {
      locations: {
        orderBy: { lastSeenAt: "desc" },
        select: {
          id: true,
          path: true,
          lastSeenAt: true,
          project: {
            select: { id: true, slug: true, name: true, color: true },
          },
        },
      },
    },
  });
  return NextResponse.json(machines);
}

/** POST /api/machines — register a machine by hand (the hook also creates them). */
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = MachineInput.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { name, ...rest } = parsed.data;
  try {
    const fields = machineFields(rest);
    const machine = await prisma.machine.upsert({
      where: { name },
      create: { name, ...fields },
      update: fields,
    });
    return NextResponse.json(machine, { status: 201 });
  } catch (error) {
    logger.error(
      "Failed to save machine",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Enregistrement impossible" },
      { status: 500 }
    );
  }
}
