import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import {
  projectInclude,
  uniqueSlug,
  wouldCreateCycle,
} from "@/lib/projets/queries";
import { ProjectInput } from "@/lib/projets/schemas";

const LOG_SOURCE = "projets-api";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/projets/[id] */
export async function GET(request: NextRequest, { params }: Ctx) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const project = await prisma.agentProject.findUnique({
    where: { id },
    include: projectInclude,
  });
  if (!project) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  return NextResponse.json(project);
}

/**
 * PATCH /api/projets/[id] — update fields. When `links` or `contacts` are
 * present they replace the existing set wholesale (the dialog always sends the
 * full list).
 */
export async function PATCH(request: NextRequest, { params }: Ctx) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const { id } = await params;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = ProjectInput.partial().safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { links, contacts, stack, ...fields } = parsed.data;

  const existing = await prisma.agentProject.findUnique({
    where: { id },
    select: { id: true, name: true, slug: true },
  });
  if (!existing) return NextResponse.json({ error: "Introuvable" }, { status: 404 });

  if (fields.parentId) {
    if (await wouldCreateCycle(id, fields.parentId)) {
      return NextResponse.json(
        { error: "Un projet ne peut pas être son propre parent." },
        { status: 400 }
      );
    }
  }

  try {
    const project = await prisma.$transaction(async (tx) => {
      // Keep the slug stable unless the project was auto-named by the bridge
      // (slug === name) and the user is now giving it a real name.
      const renameSlug =
        fields.name && fields.name !== existing.name && existing.slug === existing.name;
      const slug = renameSlug ? await uniqueSlug(fields.name as string, id) : undefined;

      await tx.agentProject.update({
        where: { id },
        data: {
          ...(fields.name !== undefined ? { name: fields.name } : {}),
          ...(slug ? { slug } : {}),
          ...(fields.color !== undefined ? { color: fields.color } : {}),
          ...(fields.image !== undefined ? { image: fields.image || null } : {}),
          ...(fields.station !== undefined ? { station: fields.station } : {}),
          ...(fields.description !== undefined
            ? { description: fields.description || null }
            : {}),
          ...(fields.path !== undefined ? { path: fields.path || null } : {}),
          ...(fields.parentId !== undefined ? { parentId: fields.parentId } : {}),
          ...(fields.organisationId !== undefined
            ? { organisationId: fields.organisationId }
            : {}),
          ...(fields.archived !== undefined ? { archived: fields.archived } : {}),
          ...(stack !== undefined ? { stack } : {}),
        },
      });

      if (links !== undefined) {
        await tx.projectLink.deleteMany({ where: { projectId: id } });
        if (links.length) {
          await tx.projectLink.createMany({
            data: links.map((l, i) => ({
              projectId: id,
              kind: l.kind,
              label: l.label || null,
              url: l.url,
              sortOrder: i,
            })),
          });
        }
      }

      if (contacts !== undefined) {
        await tx.projectContact.deleteMany({ where: { projectId: id } });
        if (contacts.length) {
          await tx.projectContact.createMany({
            data: contacts.map((c) => ({
              projectId: id,
              contactId: c.contactId,
              role: c.role || null,
            })),
            skipDuplicates: true,
          });
        }
      }

      return tx.agentProject.findUniqueOrThrow({
        where: { id },
        include: projectInclude,
      });
    });
    return NextResponse.json(project);
  } catch (error) {
    logger.error(
      "Failed to update project",
      { id, error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json({ error: "Mise à jour impossible" }, { status: 500 });
  }
}

/** DELETE /api/projets/[id] — sub-projects are kept and become top-level. */
export async function DELETE(request: NextRequest, { params }: Ctx) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const { id } = await params;
  try {
    await prisma.agentProject.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    logger.error(
      "Failed to delete project",
      { id, error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json({ error: "Suppression impossible" }, { status: 500 });
  }
}
