import { NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "notifications-api";

export const dynamic = "force-dynamic";

/** GET /api/notifications?limit=30 — the latest notifications and the unread count. */
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const limit = Math.min(
    Number(request.nextUrl.searchParams.get("limit")) || 30,
    100
  );
  const [items, unread] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: auth.userId, dismissedAt: null },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        kind: true,
        title: true,
        body: true,
        url: true,
        source: true,
        important: true,
        readAt: true,
        createdAt: true,
      },
    }),
    prisma.notification.count({
      where: { userId: auth.userId, readAt: null, dismissedAt: null },
    }),
  ]);
  return NextResponse.json({ items, unread });
}

const DeleteBody = z.object({
  ids: z.array(z.string().min(1)).min(1).max(200),
});

/**
 * DELETE /api/notifications — `{ ids }`. The notifications leave the feed for
 * good; their rows stay so the same news is not recorded a second time.
 */
export async function DELETE(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const parsed = DeleteBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  const now = new Date();
  await prisma.$transaction([
    prisma.notification.updateMany({
      where: { userId: auth.userId, id: { in: parsed.data.ids }, readAt: null },
      data: { readAt: now },
    }),
    prisma.notification.updateMany({
      where: {
        userId: auth.userId,
        id: { in: parsed.data.ids },
        dismissedAt: null,
      },
      data: { dismissedAt: now },
    }),
  ]);
  return NextResponse.json({ ok: true });
}
