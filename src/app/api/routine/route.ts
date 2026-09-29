import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/prisma";
import { layerInclude } from "@/lib/routine-schemas";

const LOG_SOURCE = "routine-api";

export const dynamic = "force-dynamic";

/** GET /api/routine — the user's calendar layers with their blocks. */
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const layers = await prisma.calendarLayer.findMany({
    where: { userId: auth.userId },
    include: layerInclude,
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  return NextResponse.json(layers);
}
