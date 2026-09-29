import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { eventKey } from "@/lib/event-organisation";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "event-organisation";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * PUT /api/events/[id]/organisation — `{ organisationId }` tags the event (and
 * its whole series) with an organisation; `null` removes the tag, so the
 * calendar's own organisation shows again.
 */
export async function PUT(request: NextRequest, { params }: Ctx) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const { id } = await params;

  const body = (await request.json().catch(() => null)) as { organisationId?: unknown } | null;
  const organisationId = body?.organisationId;
  if (organisationId !== null && typeof organisationId !== "string") {
    return NextResponse.json({ error: "organisationId (string | null) attendu" }, { status: 400 });
  }

  const select = {
    id: true,
    feedId: true,
    externalEventId: true,
    recurringEventId: true,
    masterEventId: true,
    feed: { select: { userId: true } },
  } as const;
  const event = await prisma.calendarEvent.findUnique({ where: { id }, select });
  if (!event || event.feed.userId !== auth.userId) {
    return NextResponse.json({ error: "Événement introuvable" }, { status: 404 });
  }
  const master = event.masterEventId
    ? await prisma.calendarEvent.findUnique({ where: { id: event.masterEventId }, select })
    : null;
  const key = eventKey(event, master);
  const where = { feedId_eventKey: { feedId: event.feedId, eventKey: key } };

  if (organisationId === null) {
    await prisma.eventOrganisation.deleteMany({ where: { feedId: event.feedId, eventKey: key } });
    return NextResponse.json({ organisationId: null });
  }
  const org = await prisma.organisation.findUnique({ where: { id: organisationId }, select: { id: true } });
  if (!org) return NextResponse.json({ error: "Organisation introuvable" }, { status: 404 });
  await prisma.eventOrganisation.upsert({
    where,
    create: { feedId: event.feedId, eventKey: key, organisationId },
    update: { organisationId },
  });
  return NextResponse.json({ organisationId });
}
