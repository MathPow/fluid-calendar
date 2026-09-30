import { NextRequest, NextResponse } from "next/server";

import { Prisma } from "@prisma/client";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { sanitizeLayout } from "@/lib/dashboard/layout";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "dashboard-layout-api";

export const dynamic = "force-dynamic";

/** GET /api/dashboard-layout — the saved bento, or `null` for the default. */
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const row = await prisma.userSettings.findUnique({
    where: { userId: auth.userId },
    select: { dashboardLayout: true },
  });
  return NextResponse.json({
    layout: row?.dashboardLayout ? sanitizeLayout(row.dashboardLayout) : null,
  });
}

/** PUT /api/dashboard-layout — `{ layout: [{ type, w, h }] | null }`; null resets. */
export async function PUT(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const body = await request.json().catch(() => null);
  const layout =
    body?.layout === null ? null : sanitizeLayout(body?.layout ?? undefined);
  if (body?.layout !== null && !layout) {
    return NextResponse.json(
      { error: "Disposition invalide" },
      { status: 400 }
    );
  }
  const dashboardLayout = layout
    ? (layout as unknown as Prisma.InputJsonArray)
    : Prisma.DbNull;
  await prisma.userSettings.upsert({
    where: { userId: auth.userId },
    update: { dashboardLayout },
    create: {
      userId: auth.userId,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      dashboardLayout,
    },
  });
  return NextResponse.json({ layout });
}
