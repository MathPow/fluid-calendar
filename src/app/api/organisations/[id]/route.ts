import { NextRequest, NextResponse } from "next/server";

import { jsonError } from "@/lib/api-errors";
import { authenticateRequest } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { orgKindStation } from "@/lib/projets/meta";
import { organisationSelect } from "@/lib/projets/queries";
import { OrganisationInput } from "@/lib/projets/schemas";

const LOG_SOURCE = "organisations-api";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** PATCH /api/organisations/[id] */
export async function PATCH(request: NextRequest, { params }: Ctx) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const { id } = await params;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return jsonError("api.errors.invalidJson", 400);
  }
  const parsed = OrganisationInput.partial().safeParse(json);
  if (!parsed.success) {
    return jsonError("api.errors.invalidBody", 400, undefined, {
      details: parsed.error.flatten(),
    });
  }
  const f = parsed.data;
  try {
    const org = await prisma.organisation.update({
      where: { id },
      data: {
        // Like projects: when present, the links replace the existing set.
        ...(f.links !== undefined
          ? {
              links: {
                deleteMany: {},
                create: f.links.map((l, i) => ({
                  kind: l.kind,
                  label: l.label || null,
                  url: l.url,
                  sortOrder: i,
                })),
              },
            }
          : {}),
        ...(f.name !== undefined ? { name: f.name } : {}),
        ...(f.color !== undefined ? { color: f.color } : {}),
        ...(f.image !== undefined ? { image: f.image || null } : {}),
        ...(f.kind !== undefined
          ? { kind: f.kind, station: orgKindStation(f.kind) }
          : {}),
        ...(f.description !== undefined
          ? { description: f.description || null }
          : {}),
      },
      select: organisationSelect,
    });
    return NextResponse.json(org);
  } catch (error) {
    logger.error(
      "Failed to update organisation",
      { id, error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return jsonError("api.errors.orgUpdateFailed", 500);
  }
}

/** DELETE /api/organisations/[id] — its projects fall back to the default bucket. */
export async function DELETE(request: NextRequest, { params }: Ctx) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const org = await prisma.organisation.findUnique({
    where: { id },
    select: { isDefault: true },
  });
  if (!org) return jsonError("api.errors.notFound", 404);
  if (org.isDefault) {
    return jsonError("api.errors.organisation.defaultCannotDelete", 400);
  }
  try {
    await prisma.organisation.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    logger.error(
      "Failed to delete organisation",
      { id, error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return jsonError("api.errors.deleteFailed", 500);
  }
}
