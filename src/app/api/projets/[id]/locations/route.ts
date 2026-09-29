import { NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "project-locations-api";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({
  machineId: z.string().min(1),
  path: z.string().trim().min(1, "Chemin requis").max(500),
});

/** POST /api/projets/[id]/locations — say where the project lives on a machine. */
export async function POST(request: NextRequest, { params }: Ctx) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const { id } = await params;
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { machineId, path } = parsed.data;
  try {
    const location = await prisma.projectLocation.upsert({
      where: { projectId_machineId: { projectId: id, machineId } },
      create: { projectId: id, machineId, path },
      update: { path },
    });
    return NextResponse.json(location, { status: 201 });
  } catch (error) {
    logger.error(
      "Failed to save location",
      { id, error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Enregistrement impossible" },
      { status: 500 }
    );
  }
}

/** DELETE /api/projets/[id]/locations?locationId=… */
export async function DELETE(request: NextRequest, { params }: Ctx) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const locationId = request.nextUrl.searchParams.get("locationId");
  if (!locationId)
    return NextResponse.json({ error: "locationId requis" }, { status: 400 });
  try {
    await prisma.projectLocation.deleteMany({
      where: { id: locationId, projectId: id },
    });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    logger.error(
      "Failed to delete location",
      { id, error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Suppression impossible" },
      { status: 500 }
    );
  }
}
