import { NextRequest, NextResponse } from "next/server";

import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { TaskSyncManager } from "@/lib/task-sync/task-sync-manager";

const LOG_SOURCE = "task-sync-cron";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// One run at a time: a slow provider must not pile runs on top of each other.
let running = false;

/**
 * POST /api/task-sync/cron — sync every enabled board and list, both ways.
 * Called by scripts/task-sync-cron.sh with the cron secret; no user session.
 */
export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (running) {
    return NextResponse.json({ skipped: "a sync is already running" });
  }

  running = true;
  try {
    const mappings = await prisma.taskListMapping.findMany({
      where: {
        syncEnabled: true,
        provider: { enabled: true, syncEnabled: true },
      },
      include: { provider: true },
      orderBy: { lastSyncedAt: { sort: "asc", nulls: "first" } },
    });

    const manager = new TaskSyncManager();
    const summary = {
      lists: mappings.length,
      synced: 0,
      failed: 0,
      imported: 0,
      updated: 0,
      deleted: 0,
    };

    for (const mapping of mappings) {
      try {
        const result = await manager.syncTaskList(mapping);
        if (result.success) summary.synced += 1;
        else summary.failed += 1;
        summary.imported += result.imported;
        summary.updated += result.updated;
        summary.deleted += result.deleted;
      } catch (error) {
        summary.failed += 1;
        logger.error(
          "Scheduled sync failed for a list",
          {
            mappingId: mapping.id,
            list: mapping.externalListName,
            error: error instanceof Error ? error.message : String(error),
          },
          LOG_SOURCE
        );
      }
    }

    await prisma.taskProvider.updateMany({
      where: { id: { in: [...new Set(mappings.map((m) => m.providerId))] } },
      data: { lastSyncedAt: new Date() },
    });

    return NextResponse.json(summary);
  } finally {
    running = false;
  }
}
