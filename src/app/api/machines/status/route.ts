import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { machineStats } from "@/lib/machines/netdata";
import { prisma } from "@/lib/prisma";
import { machineSelect } from "@/lib/projets/queries";

const LOG_SOURCE = "machines-status-api";

export const dynamic = "force-dynamic";

/** GET /api/machines/status — every machine with its live Netdata readings. */
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;

  const machines = await prisma.machine.findMany({
    orderBy: { name: "asc" },
    select: { ...machineSelect, _count: { select: { locations: true } } },
  });

  const rows = await Promise.all(
    machines.map(async ({ _count, ...m }) => ({
      ...m,
      projects: _count.locations,
      stats: m.statsUrl ? await machineStats(m.statsUrl) : null,
    }))
  );

  return NextResponse.json(
    { at: new Date().toISOString(), machines: rows },
    { headers: { "cache-control": "no-store" } }
  );
}
