import { NextRequest, NextResponse } from "next/server";

import { getT } from "@/i18n/server";
import { authenticateRequest } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import {
  expireStaleShowcaseRuns,
  showcaseRunSelect,
} from "@/lib/projets/showcase-runs";

const LOG_SOURCE = "projets-showcase-run";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/projets/[id]/showcase-run — the latest run, or null. */
export async function GET(request: NextRequest, { params }: Ctx) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const { id } = await params;

  await expireStaleShowcaseRuns(id);
  const run = await prisma.showcaseRun.findFirst({
    where: { projectId: id },
    orderBy: { createdAt: "desc" },
    select: showcaseRunSelect,
  });
  return NextResponse.json({ run });
}

/**
 * POST /api/projets/[id]/showcase-run — queue a /project-showcase run for the
 * host runner. One at a time per project; the project needs a path on the box.
 */
export async function POST(request: NextRequest, { params }: Ctx) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const t = await getT();
  const { id } = await params;

  const project = await prisma.agentProject.findUnique({
    where: { id },
    select: { id: true, slug: true, path: true },
  });
  if (!project) {
    return NextResponse.json({ error: t("api.projets.notFound") }, { status: 404 });
  }
  if (!project.path) {
    return NextResponse.json(
      { error: t("api.projets.showcase.noPath") },
      { status: 400 }
    );
  }

  await expireStaleShowcaseRuns(id);
  const active = await prisma.showcaseRun.findFirst({
    where: { projectId: id, status: { in: ["queued", "running"] } },
    orderBy: { createdAt: "desc" },
    select: showcaseRunSelect,
  });
  if (active) {
    return NextResponse.json(
      { error: t("api.projets.showcase.alreadyRunning"), run: active },
      { status: 409 }
    );
  }

  const run = await prisma.showcaseRun.create({
    data: { projectId: id, status: "queued" },
    select: showcaseRunSelect,
  });
  logger.info(
    "showcase run queued",
    { runId: run.id, slug: project.slug },
    LOG_SOURCE
  );
  return NextResponse.json({ run }, { status: 201 });
}
