import { NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "task-sync-mapping-api";

// Schema for creating a new task list mapping
const createMappingSchema = z.object({
  providerId: z.string().min(1),
  externalListId: z.string().min(1),
  externalListName: z.string().min(1),
  // Where the tasks go. All optional: with none of them, a task list named
  // after the external list is created.
  /** An existing task list. */
  projectId: z.string().min(1).optional(),
  /** The organisation to file the list under. */
  organisationId: z.string().min(1).nullable().optional(),
  /** A project of the Projets tab; it must belong to `organisationId`. */
  agentProjectId: z.string().min(1).nullable().optional(),
  syncEnabled: z.boolean().optional().default(true),
  direction: z
    .enum(["incoming", "outgoing", "bidirectional"])
    .optional()
    .default("incoming"),
});

/**
 * GET /api/task-sync/mappings
 * Get all task list mappings for the user
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) {
      return auth.response;
    }

    const userId = auth.userId;

    // Get query params
    const searchParams = request.nextUrl.searchParams;
    const providerId = searchParams.get("providerId");

    // Get mappings with optional provider filter
    const mappings = await prisma.taskListMapping.findMany({
      where: {
        provider: {
          userId,
          ...(providerId ? { id: providerId } : {}),
        },
      },
      include: {
        provider: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
        project: {
          select: {
            id: true,
            name: true,
            color: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json({
      mappings: mappings.map((mapping) => ({
        id: mapping.id,
        providerId: mapping.providerId,
        providerName: mapping.provider.name,
        providerType: mapping.provider.type,
        externalListId: mapping.externalListId,
        externalListName: mapping.externalListName,
        projectId: mapping.projectId,
        projectName: mapping.project.name,
        projectColor: mapping.project.color,
        syncEnabled: mapping.syncEnabled,
        lastSyncedAt: mapping.lastSyncedAt,
        createdAt: mapping.createdAt,
        updatedAt: mapping.updatedAt,
      })),
    });
  } catch (error) {
    logger.error(
      "Failed to get task list mappings",
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      LOG_SOURCE
    );

    return NextResponse.json(
      { error: "Failed to get task list mappings" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/task-sync/mappings
 * Create a new task list mapping
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) {
      return auth.response;
    }

    const userId = auth.userId;

    // Parse and validate the request body
    const body = await request.json();
    const validatedData = createMappingSchema.parse(body);

    // Verify the provider exists and belongs to the user
    const provider = await prisma.taskProvider.findUnique({
      where: {
        id: validatedData.providerId,
        userId,
      },
    });

    if (!provider) {
      return NextResponse.json(
        { error: "Provider not found or does not belong to the user" },
        { status: 404 }
      );
    }

    // Check if a mapping already exists for this external list
    const existingMapping = await prisma.taskListMapping.findFirst({
      where: {
        providerId: validatedData.providerId,
        externalListId: validatedData.externalListId,
      },
    });

    if (existingMapping) {
      return NextResponse.json(
        { error: "A mapping already exists for this external list" },
        { status: 409 }
      );
    }

    // Find the task list the tasks go to, creating it when needed.
    const { organisationId, agentProjectId } = validatedData;
    let project: { id: string } | null = null;

    if (validatedData.projectId) {
      project = await prisma.project.findUnique({
        where: { id: validatedData.projectId, userId },
        select: { id: true },
      });
      if (!project) {
        return NextResponse.json(
          { error: "Project not found or does not belong to the user" },
          { status: 404 }
        );
      }
    } else if (agentProjectId) {
      if (!organisationId) {
        return NextResponse.json(
          { error: "Pick an organisation before picking a project" },
          { status: 400 }
        );
      }
      const agent = await prisma.agentProject.findUnique({
        where: { id: agentProjectId },
        select: {
          id: true,
          name: true,
          color: true,
          description: true,
          organisationId: true,
          taskProject: { select: { id: true, userId: true } },
        },
      });
      if (!agent || agent.organisationId !== organisationId) {
        return NextResponse.json(
          { error: "This project does not belong to that organisation" },
          { status: 400 }
        );
      }
      if (agent.taskProject && agent.taskProject.userId !== userId) {
        return NextResponse.json(
          { error: "Project not found or does not belong to the user" },
          { status: 404 }
        );
      }
      project =
        agent.taskProject ??
        (await prisma.project.create({
          data: {
            name: agent.name,
            color: agent.color,
            description: agent.description,
            status: "active",
            userId,
            agentProjectId: agent.id,
          },
          select: { id: true },
        }));
    } else {
      if (organisationId) {
        const organisation = await prisma.organisation.findUnique({
          where: { id: organisationId },
          select: { id: true },
        });
        if (!organisation) {
          return NextResponse.json(
            { error: "Organisation not found" },
            { status: 400 }
          );
        }
      }
      project = await prisma.project.create({
        data: {
          name: validatedData.externalListName,
          description: `Synced with ${provider.name}`,
          status: "active",
          userId,
          organisationId: organisationId ?? null,
        },
        select: { id: true },
      });
    }

    // One task list takes one external list per connection.
    const taken = await prisma.taskListMapping.findFirst({
      where: { providerId: validatedData.providerId, projectId: project.id },
      select: { externalListName: true },
    });
    if (taken) {
      return NextResponse.json(
        {
          error: `This project already syncs with « ${taken.externalListName} » on this connection`,
        },
        { status: 409 }
      );
    }

    // Create the mapping
    const mapping = await prisma.taskListMapping.create({
      data: {
        providerId: validatedData.providerId,
        externalListId: validatedData.externalListId,
        externalListName: validatedData.externalListName,
        projectId: project.id,
        syncEnabled: validatedData.syncEnabled,
        direction: validatedData.direction,
      },
      include: {
        provider: {
          select: {
            name: true,
            type: true,
          },
        },
        project: {
          select: {
            name: true,
            color: true,
          },
        },
      },
    });

    return NextResponse.json({
      mapping: {
        id: mapping.id,
        providerId: mapping.providerId,
        providerName: mapping.provider.name,
        providerType: mapping.provider.type,
        externalListId: mapping.externalListId,
        externalListName: mapping.externalListName,
        projectId: mapping.projectId,
        projectName: mapping.project.name,
        projectColor: mapping.project.color,
        syncEnabled: mapping.syncEnabled,
        lastSyncedAt: mapping.lastSyncedAt,
        direction: mapping.direction,
        createdAt: mapping.createdAt,
        updatedAt: mapping.updatedAt,
      },
    });
  } catch (error) {
    logger.error(
      "Failed to create task list mapping",
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      LOG_SOURCE
    );

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid data", details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Failed to create task list mapping" },
      { status: 500 }
    );
  }
}
