import { NextRequest, NextResponse } from "next/server";

import { authenticateIngest } from "@/lib/auth/ingest-auth";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "companion-agenda-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HOUR_MS = 60 * 60 * 1000;
const MAX_WINDOW_MS = 7 * 24 * HOUR_MS;

/**
 * GET /api/companion/agenda — polled by the Cumchum desktop companion (a slime
 * living on the Linux desktop). Read-only: it returns what is coming up so the
 * companion can schedule its own reminders locally, which also lets it announce
 * reminders it missed while the laptop was asleep.
 *
 * Auth: X-Api-Key header, same key as the recordings ingest (RECORDINGS_API_KEY).
 *
 * Query params (ISO-8601, optional):
 *   from — window start (default: now − 12h)
 *   to   — window end   (default: now + 36h, capped at 7 days after `from`)
 *
 * Response: {
 *   now,
 *   events: [{ id, title, start, end, allDay, location }],
 *   tasks:  [{ id, title, dueDate, scheduledStart, priority, status }],
 * }
 */
export async function GET(request: NextRequest) {
  const auth = await authenticateIngest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;

  const now = new Date();
  const params = request.nextUrl.searchParams;
  const from = parseDate(params.get("from")) ?? new Date(now.getTime() - 12 * HOUR_MS);
  let to = parseDate(params.get("to")) ?? new Date(now.getTime() + 36 * HOUR_MS);
  if (to.getTime() - from.getTime() > MAX_WINDOW_MS) {
    to = new Date(from.getTime() + MAX_WINDOW_MS);
  }

  try {
    const events = await prisma.calendarEvent.findMany({
      where: {
        feed: { userId: auth.userId },
        isMaster: false,
        start: { lt: to },
        end: { gt: from },
      },
      select: { id: true, title: true, start: true, end: true, allDay: true, location: true },
      orderBy: { start: "asc" },
    });

    const tasks = await prisma.task.findMany({
      where: {
        userId: auth.userId,
        status: { not: "completed" },
        OR: [
          { dueDate: { gte: from, lt: to } },
          { scheduledStart: { gte: from, lt: to } },
        ],
      },
      select: {
        id: true,
        title: true,
        dueDate: true,
        scheduledStart: true,
        priority: true,
        status: true,
      },
      orderBy: { dueDate: "asc" },
    });

    return NextResponse.json({ now: now.toISOString(), events, tasks });
  } catch (error) {
    logger.error(
      "Failed to load companion agenda",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json({ error: "Failed to load agenda" }, { status: 500 });
  }
}

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}
