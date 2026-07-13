import { NextRequest, NextResponse } from "next/server";

import { authenticateIngest } from "@/lib/auth/ingest-auth";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "shortcuts-alarms-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// iOS alarms created by the Shortcuts "Create Alarm" action are TIME-OF-DAY
// only (they ring at the next occurrence of HH:MM), not date-bound. The next
// occurrence of a given time-of-day is always within the next 24h, so an alarm
// time inside this window is guaranteed to be its own next occurrence — i.e. it
// rings at exactly the right moment. That's why we only hand out alarms whose
// fire time falls in the next 24 hours.
const LOOKAHEAD_MS = 24 * 60 * 60 * 1000;
// Allow an alarm whose fire time slipped slightly into the past (late poll) to
// still be armed — it'll just ring almost immediately.
const GRACE_MS = 2 * 60 * 1000;

/**
 * GET /api/shortcuts/alarms — polled by an iOS Shortcut (via a time-based
 * Personal Automation). Returns calendar events flagged "strong alarm" whose
 * alarm fire time (start − alarmMinutes) is within the next 24h and that have
 * not yet been handed out. Each returned event is marked armed so it is served
 * exactly once (the flag resets if the event's time or the flag changes).
 *
 * Auth: X-Api-Key header, same key as the recordings ingest (RECORDINGS_API_KEY).
 *
 * Query params:
 *   peek=1  — return the due alarms WITHOUT marking them armed (for testing).
 *
 * Response: { alarms: [{ id, title, start, alarmTime, alarmMinutes }] }
 * where `alarmTime` is an ISO-8601 UTC timestamp the Shortcut formats to the
 * device's local time and passes to the "Create Alarm" action.
 */
export async function GET(request: NextRequest) {
  const auth = await authenticateIngest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;

  const peek = request.nextUrl.searchParams.get("peek") === "1";
  const now = new Date();
  const horizon = new Date(now.getTime() + LOOKAHEAD_MS);

  try {
    // Fetch not-yet-armed strong-alarm events starting in the future. The set is
    // tiny (only events the user explicitly flagged), so we compute each event's
    // exact alarm time in JS rather than in SQL (start − alarmMinutes varies per
    // row). The upper bound on `start` is a cheap pre-filter.
    const candidates = await prisma.calendarEvent.findMany({
      where: {
        feed: { userId: auth.userId },
        strongAlarm: true,
        allDay: false,
        alarmArmedAt: null,
        start: { gt: now },
      },
      select: { id: true, title: true, start: true, alarmMinutes: true },
    });

    const due = candidates.filter((e) => {
      const alarmTime = e.start.getTime() - e.alarmMinutes * 60 * 1000;
      return (
        alarmTime > now.getTime() - GRACE_MS &&
        alarmTime <= horizon.getTime()
      );
    });

    if (!peek && due.length > 0) {
      await prisma.calendarEvent.updateMany({
        where: { id: { in: due.map((e) => e.id) } },
        data: { alarmArmedAt: now },
      });
    }

    const alarms = due.map((e) => ({
      id: e.id,
      title: e.title,
      start: e.start.toISOString(),
      alarmTime: new Date(
        e.start.getTime() - e.alarmMinutes * 60 * 1000
      ).toISOString(),
      alarmMinutes: e.alarmMinutes,
    }));

    logger.info(
      "Served strong alarms to Shortcut",
      { count: alarms.length, peek },
      LOG_SOURCE
    );

    return NextResponse.json({ alarms });
  } catch (error) {
    logger.error(
      "Failed to serve strong alarms",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Failed to load alarms" },
      { status: 500 }
    );
  }
}
