import { NextRequest, NextResponse } from "next/server";

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
      where: { userId: auth.userId },
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
    prisma.notification.count({ where: { userId: auth.userId, readAt: null } }),
  ]);
  return NextResponse.json({ items, unread });
}
