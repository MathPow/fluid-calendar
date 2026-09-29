import { NextRequest, NextResponse } from "next/server";

import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import {
  expireStaleShowcaseRuns,
  ingestTokenOk,
} from "@/lib/projets/showcase-runs";

const LOG_SOURCE = "showcase-runs-ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/ingest/showcase-runs/claim — the host runner takes the oldest
 * queued run. The claim is a conditional update (status still "queued"), so
 * two runners can never get the same run. 204 when the queue is empty.
 */
export async function POST(request: NextRequest) {
  if (!process.env.PROJECT_INGEST_TOKEN) {
    return NextResponse.json(
      { error: "Ingest not configured" },
      { status: 503 }
    );
  }
  if (!ingestTokenOk(request)) {
    logger.warn("showcase-runs claim rejected: bad token", {}, LOG_SOURCE);
    return new NextResponse("Unauthorized", { status: 401 });
  }

  await expireStaleShowcaseRuns();

  // A few tries in case another runner wins the race for the head of the queue.
  for (let attempt = 0; attempt < 5; attempt++) {
    const next = await prisma.showcaseRun.findFirst({
      where: { status: "queued" },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (!next) return new NextResponse(null, { status: 204 });

    const { count } = await prisma.showcaseRun.updateMany({
      where: { id: next.id, status: "queued" },
      data: { status: "running", startedAt: new Date() },
    });
    if (count === 0) continue;

    const run = await prisma.showcaseRun.findUniqueOrThrow({
      where: { id: next.id },
      select: {
        id: true,
        project: { select: { slug: true, name: true, path: true } },
      },
    });
    logger.info(
      "showcase run claimed",
      { runId: run.id, slug: run.project.slug },
      LOG_SOURCE
    );
    return NextResponse.json(run);
  }
  return new NextResponse(null, { status: 204 });
}
