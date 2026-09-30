import { NextRequest, NextResponse } from "next/server";

import { isPromptKind, type LauncherRecurrence } from "@/lib/launchers";
import { logger } from "@/lib/logger";
import { nextOccurrence, runMachineAction } from "@/lib/machine-actions";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "run-machine-actions-cron";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorize(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") || "";
  if (header === `Bearer ${secret}`) return true;
  // Match the x-cron-secret convention used elsewhere for robustness.
  return request.headers.get("x-cron-secret") === secret;
}

/**
 * POST /api/cron/run-machine-actions — fires every scheduled prompt shortcut
 * whose `scheduledFor` is due, then advances its `scheduledFor` when a
 * recurrence is set. One-shot rows keep their timestamp but `lastRunAt`
 * ensures they don't fire twice. Protected by CRON_SECRET.
 */
export async function POST(request: NextRequest) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const now = new Date();
  const dueRows = await prisma.launchShortcut.findMany({
    where: {
      scheduledFor: { lte: now, not: null },
      kind: { in: ["claude-prompt", "codex-prompt"] },
    },
    select: {
      id: true,
      kind: true,
      promptText: true,
      scheduledFor: true,
      recurrence: true,
      lastRunAt: true,
      machine: {
        select: {
          id: true,
          name: true,
          host: true,
          ip: true,
          sshUser: true,
          sshKey: true,
          agentTokenHash: true,
          agentSeenAt: true,
        },
      },
    },
    take: 50,
  });
  // Skip rows already handled for the current occurrence.
  const due = dueRows.filter(
    (r) => !r.lastRunAt || (r.scheduledFor && r.lastRunAt < r.scheduledFor)
  );

  const fired: string[] = [];
  const skipped: { id: string; error: string }[] = [];
  for (const l of due) {
    if (!isPromptKind(l.kind)) continue;
    const result = await runMachineAction({
      id: l.id,
      kind: l.kind,
      promptText: l.promptText,
      machine: l.machine,
    });
    if (!result.ok) {
      skipped.push({ id: l.id, error: result.error });
      await prisma.launchShortcut
        .update({
          where: { id: l.id },
          data: { lastRunAt: now, lastError: result.error, lastResult: null },
        })
        .catch(() => {});
    } else {
      fired.push(l.id);
    }
    if (l.scheduledFor) {
      const next = nextOccurrence(
        l.scheduledFor,
        l.recurrence as LauncherRecurrence | null,
        now
      );
      if (next) {
        await prisma.launchShortcut
          .update({
            where: { id: l.id },
            data: { scheduledFor: next },
          })
          .catch((e) =>
            logger.error(
              "recurrence bump failed",
              { id: l.id, err: e instanceof Error ? e.message : String(e) },
              LOG_SOURCE
            )
          );
      }
    }
  }

  return NextResponse.json({ fired, skipped, now: now.toISOString() });
}
