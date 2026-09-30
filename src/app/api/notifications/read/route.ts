import { NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "notifications-read-api";

const Body = z.union([
  z.object({ all: z.literal(true) }),
  z.object({
    ids: z.array(z.string().min(1)).min(1).max(200),
    /** false puts them back to unread. */
    read: z.boolean().optional(),
  }),
]);

/** POST /api/notifications/read — `{ ids, read? }` or `{ all: true }`. */
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  if ("ids" in parsed.data && parsed.data.read === false) {
    await prisma.notification.updateMany({
      where: { userId: auth.userId, id: { in: parsed.data.ids } },
      data: { readAt: null },
    });
    return NextResponse.json({ ok: true });
  }
  await prisma.notification.updateMany({
    where: {
      userId: auth.userId,
      readAt: null,
      dismissedAt: null,
      ...("ids" in parsed.data ? { id: { in: parsed.data.ids } } : {}),
    },
    data: { readAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
