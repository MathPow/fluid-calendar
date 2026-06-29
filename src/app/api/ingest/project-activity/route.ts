import { NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { safeEqual } from "@/lib/recordings/storage";

const LOG_SOURCE = "project-activity-ingest";

// Reads the transcript via the bridge; keep on the Node runtime and never cache.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  project: z.string().min(1), // folder basename / slug
  path: z.string().optional(),
  summary: z.string().min(1),
  agent: z.string().optional(),
  source: z.string().optional(),
});

/**
 * Auth for the claude-watch bridge (an unattended client that can't do a
 * NextAuth login). It sends a static token in `Authorization: Bearer <token>`
 * (or `X-Api-Key`), matched in constant time against PROJECT_INGEST_TOKEN.
 */
function tokenOk(request: NextRequest): boolean {
  const expected = process.env.PROJECT_INGEST_TOKEN;
  if (!expected) return false;
  const bearer = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "");
  const provided = bearer || request.headers.get("x-api-key") || "";
  return provided.length > 0 && safeEqual(provided, expected);
}

/**
 * POST /api/ingest/project-activity — record one turn of agent work in a repo.
 * Upserts the AgentProject by slug (bumping lastActivityAt) and appends an
 * AgentActivity. Called fire-and-forget by the claude-watch bridge.
 */
export async function POST(request: NextRequest) {
  if (!process.env.PROJECT_INGEST_TOKEN) {
    logger.error(
      "project-activity ingest attempted but PROJECT_INGEST_TOKEN is not set",
      {},
      LOG_SOURCE
    );
    return NextResponse.json({ error: "Ingest not configured" }, { status: 503 });
  }

  if (!tokenOk(request)) {
    logger.warn("project-activity ingest rejected: bad token", {}, LOG_SOURCE);
    return new NextResponse("Unauthorized", { status: 401 });
  }

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

  const { project, path, summary, agent, source } = parsed.data;

  try {
    const proj = await prisma.agentProject.upsert({
      where: { slug: project },
      create: {
        slug: project,
        name: project,
        path: path ?? null,
        lastActivityAt: new Date(),
      },
      update: {
        lastActivityAt: new Date(),
        ...(path ? { path } : {}),
      },
    });

    const activity = await prisma.agentActivity.create({
      data: {
        projectId: proj.id,
        summary,
        agent: agent ?? null,
        source: source ?? null,
      },
    });

    return NextResponse.json(
      { ok: true, activityId: activity.id },
      { status: 201 }
    );
  } catch (error) {
    logger.error(
      "Failed to ingest project activity",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Failed to store activity" },
      { status: 500 }
    );
  }
}
