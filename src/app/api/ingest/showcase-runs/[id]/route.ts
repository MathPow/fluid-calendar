import { NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { ingestTokenOk, tailLog } from "@/lib/projets/showcase-runs";

const LOG_SOURCE = "showcase-runs-ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  status: z.enum(["done", "failed"]),
  log: z.string().max(1_000_000).optional(),
  error: z.string().max(4000).optional(),
});

type Ctx = { params: Promise<{ id: string }> };

/** PATCH /api/ingest/showcase-runs/[id] — the runner reports how a run ended. */
export async function PATCH(request: NextRequest, { params }: Ctx) {
  if (!process.env.PROJECT_INGEST_TOKEN) {
    return NextResponse.json({ error: "Ingest not configured" }, { status: 503 });
  }
  if (!ingestTokenOk(request)) {
    logger.warn("showcase-runs report rejected: bad token", {}, LOG_SOURCE);
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const { id } = await params;

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
  const { status, log, error } = parsed.data;

  const run = await prisma.showcaseRun.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.showcaseRun.update({
    where: { id },
    data: {
      status,
      finishedAt: new Date(),
      log: tailLog(log),
      error: status === "failed" ? error || "Échec sans message." : null,
    },
  });
  logger.info("showcase run finished", { runId: id, status }, LOG_SOURCE);
  return NextResponse.json({ ok: true });
}
