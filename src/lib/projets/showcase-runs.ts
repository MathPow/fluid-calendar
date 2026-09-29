import { NextRequest } from "next/server";

import { prisma } from "@/lib/prisma";
import { safeEqual } from "@/lib/recordings/storage";

/**
 * /project-showcase runs queued from the project page. DreamDash runs in
 * Docker and can't start `claude`, so it only keeps the queue; the host runner
 * (~/.claude/skills/project-showcase/scripts/runner.mjs) claims and runs them.
 */

export const SHOWCASE_RUN_STATUSES = [
  "queued",
  "running",
  "done",
  "failed",
] as const;
export type ShowcaseRunStatus = (typeof SHOWCASE_RUN_STATUSES)[number];

/** A run still "running" after this long is considered dead (runner crashed…). */
export const SHOWCASE_RUN_STALE_MS = 45 * 60 * 1000;
/** The log kept on a run is the tail of the output. */
export const SHOWCASE_RUN_LOG_MAX = 20 * 1024;

export const tailLog = (log: string | null | undefined): string | null =>
  log ? log.slice(-SHOWCASE_RUN_LOG_MAX) : null;

/** Fails runs stuck in "running" (lazy, called from claim and GET). */
export async function expireStaleShowcaseRuns(projectId?: string) {
  await prisma.showcaseRun.updateMany({
    where: {
      status: "running",
      startedAt: { lt: new Date(Date.now() - SHOWCASE_RUN_STALE_MS) },
      ...(projectId ? { projectId } : {}),
    },
    data: {
      status: "failed",
      finishedAt: new Date(),
      error: "Délai dépassé : le runner n'a pas répondu en 45 min.",
    },
  });
}

/** Same static token as the other ingest routes (PROJECT_INGEST_TOKEN). */
export function ingestTokenOk(request: NextRequest): boolean {
  const expected = process.env.PROJECT_INGEST_TOKEN;
  if (!expected) return false;
  const bearer = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "");
  const provided = bearer || request.headers.get("x-api-key") || "";
  return provided.length > 0 && safeEqual(provided, expected);
}

export const showcaseRunSelect = {
  id: true,
  status: true,
  error: true,
  log: true,
  createdAt: true,
  startedAt: true,
  finishedAt: true,
} as const;

export type ShowcaseRunView = {
  id: string;
  status: ShowcaseRunStatus;
  error: string | null;
  log: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
};
