import { NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import {
  presentTaskProject,
  taskProjectInclude,
} from "@/lib/projets/task-link";

const LOG_SOURCE = "projects-link";

export const dynamic = "force-dynamic";

/**
 * GET /api/projects/link — what a project picker needs: every project of the
 * Projets tab (with the id of its task list when one exists) and the task
 * lists that aren't attached to any of them.
 */
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;

  const [projets, lists, organisations] = await Promise.all([
    prisma.agentProject.findMany({
      where: { archived: false },
      select: {
        id: true,
        slug: true,
        name: true,
        color: true,
        parentId: true,
        station: true,
        organisation: {
          select: { id: true, name: true, isDefault: true, sortOrder: true },
        },
        taskProject: { select: { id: true, userId: true } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.project.findMany({
      where: { userId: auth.userId, agentProjectId: null, status: "active" },
      select: {
        id: true,
        name: true,
        color: true,
        organisation: {
          select: { id: true, name: true, isDefault: true, sortOrder: true },
        },
        _count: { select: { tasks: true } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.organisation.findMany({
      select: { id: true, name: true, color: true, kind: true, isDefault: true, sortOrder: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
  ]);

  return NextResponse.json({
    organisations,
    projets: projets.map((p) => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      color: p.color,
      parentId: p.parentId,
      station: p.station,
      organisation: p.organisation,
      taskProjectId:
        p.taskProject?.userId === auth.userId ? p.taskProject.id : null,
    })),
    lists,
  });
}

const Body = z.object({
  agentProjectId: z.string().min(1),
  /** Attach this existing task list instead of creating a new one. */
  projectId: z.string().min(1).optional(),
});

/**
 * POST /api/projects/link — give a Projets project its task list. Reuses the
 * one already attached, attaches `projectId` when given, or creates one.
 */
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const { agentProjectId, projectId } = parsed.data;

  const agent = await prisma.agentProject.findUnique({
    where: { id: agentProjectId },
    select: { id: true, name: true, color: true, description: true },
  });
  if (!agent)
    return NextResponse.json({ error: "Projet introuvable" }, { status: 404 });

  try {
    const existing = await prisma.project.findUnique({
      where: { agentProjectId },
      include: taskProjectInclude,
    });

    if (existing) {
      if (projectId && projectId !== existing.id) {
        return NextResponse.json(
          {
            error: "Ce projet a déjà une liste de tâches.",
            errorKey: "api.projects.alreadyHasTaskList",
          },
          { status: 409 }
        );
      }
      return NextResponse.json(presentTaskProject(existing));
    }

    if (projectId) {
      const attached = await prisma.project.update({
        where: { id: projectId, userId: auth.userId },
        data: { agentProjectId },
        include: taskProjectInclude,
      });
      return NextResponse.json(presentTaskProject(attached));
    }

    const created = await prisma.project.create({
      data: {
        name: agent.name,
        color: agent.color,
        description: agent.description,
        status: "active",
        userId: auth.userId,
        agentProjectId,
      },
      include: taskProjectInclude,
    });
    return NextResponse.json(presentTaskProject(created), { status: 201 });
  } catch (error) {
    logger.error(
      "Failed to link task list",
      {
        agentProjectId,
        error: error instanceof Error ? error.message : String(error),
      },
      LOG_SOURCE
    );
    return NextResponse.json({ error: "Liaison impossible" }, { status: 500 });
  }
}

/** DELETE /api/projects/link?projectId=… — detach a task list (its tasks stay). */
export async function DELETE(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const projectId = request.nextUrl.searchParams.get("projectId");
  if (!projectId)
    return NextResponse.json({ error: "projectId requis" }, { status: 400 });
  try {
    // Keep the name and colour it was showing, so the list doesn't revert to stale values.
    const current = await prisma.project.findFirst({
      where: { id: projectId, userId: auth.userId },
      include: taskProjectInclude,
    });
    if (!current)
      return NextResponse.json({ error: "Introuvable" }, { status: 404 });
    const shown = presentTaskProject(current);
    const updated = await prisma.project.update({
      where: { id: projectId },
      data: { agentProjectId: null, name: shown.name, color: shown.color },
      include: taskProjectInclude,
    });
    return NextResponse.json(presentTaskProject(updated));
  } catch (error) {
    logger.error(
      "Failed to unlink task list",
      {
        projectId,
        error: error instanceof Error ? error.message : String(error),
      },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Détachement impossible", errorKey: "api.projects.unlinkFailed" },
      { status: 500 }
    );
  }
}
