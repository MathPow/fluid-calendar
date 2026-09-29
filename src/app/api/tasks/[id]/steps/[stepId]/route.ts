import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "task-steps-api";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/tasks/[id]/steps/[stepId] — tick or untick one step without
 * resubmitting the whole task. Body: { done: boolean }. Returns the task.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; stepId: string }> }
) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const { id, stepId } = await params;

  let body: { done?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (typeof body.done !== "boolean") {
    return NextResponse.json({ error: "done must be a boolean" }, { status: 400 });
  }

  const step = await prisma.taskStep.findFirst({
    where: { id: stepId, taskId: id, task: { userId: auth.userId } },
    select: { id: true },
  });
  if (!step) return NextResponse.json({ error: "Step not found" }, { status: 404 });

  try {
    await prisma.taskStep.update({
      where: { id: stepId },
      data: { done: body.done, completedAt: body.done ? new Date() : null },
    });
    const task = await prisma.task.findUniqueOrThrow({
      where: { id },
      include: { tags: true, project: true, steps: { orderBy: { sortOrder: "asc" } } },
    });
    return NextResponse.json(task);
  } catch (error) {
    logger.error(
      "Failed to update step",
      { id, stepId, error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json({ error: "Failed to update step" }, { status: 500 });
  }
}
