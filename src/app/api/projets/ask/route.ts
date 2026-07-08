import { NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { answerProjectQuestion, type ActivityForContext } from "@/lib/projets/ask";

const LOG_SOURCE = "projets-ask";

// Calls the local LLM (slow, CPU-bound); keep on the Node runtime and never cache.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  question: z.string().min(1).max(500),
  slug: z.string().optional(), // per-project when set; all projects when omitted
});

// Enough recent entries to answer "what did I do lately" without blowing the
// small model's context — buildContext() trims further by char budget.
const PER_PROJECT_TAKE = 200;
const GLOBAL_TAKE = 150;

/**
 * POST /api/projets/ask — answer a natural-language question about project
 * activity. Body: { question, slug? }. With `slug`, scoped to that repo;
 * without, across all projects. Requires a signed-in session.
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

  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { question, slug } = parsed.data;

  try {
    let activities: ActivityForContext[];
    let scope: string;

    if (slug) {
      const project = await prisma.agentProject.findUnique({
        where: { slug },
        include: {
          activities: {
            orderBy: { createdAt: "desc" },
            take: PER_PROJECT_TAKE,
            select: { summary: true, createdAt: true },
          },
        },
      });
      if (!project) {
        return NextResponse.json({ error: "Unknown project" }, { status: 404 });
      }
      activities = project.activities;
      scope = `the project "${project.name}"`;
    } else {
      const rows = await prisma.agentActivity.findMany({
        orderBy: { createdAt: "desc" },
        take: GLOBAL_TAKE,
        select: {
          summary: true,
          createdAt: true,
          project: { select: { name: true } },
        },
      });
      activities = rows.map((r) => ({
        summary: r.summary,
        createdAt: r.createdAt,
        projectName: r.project.name,
      }));
      scope = "all projects";
    }

    const answer = await answerProjectQuestion(question, activities, scope);
    return NextResponse.json({ answer });
  } catch (error) {
    logger.error(
      "Failed to answer project question",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Impossible d'obtenir une réponse. Réessaie." },
      { status: 500 }
    );
  }
}
