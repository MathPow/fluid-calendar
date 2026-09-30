import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { requireStepUp } from "@/lib/auth/step-up";
import { LauncherInput, launcherSelect } from "@/lib/launchers";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "launchers-api";

export const dynamic = "force-dynamic";

/** GET /api/launchers — the account-menu launch buttons, in order. */
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const rows = await prisma.launchShortcut.findMany({
    where: { userId: auth.userId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: launcherSelect,
  });
  return NextResponse.json(rows);
}

/** POST /api/launchers — a new launch button, last. */
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const stepUp = requireStepUp(request, auth.userId);
  if (stepUp) return stepUp;
  const parsed = LauncherInput.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalide" },
      { status: 400 }
    );
  }
  const data = parsed.data;
  const count = await prisma.launchShortcut.count({
    where: { userId: auth.userId },
  });
  const row = await prisma.launchShortcut.create({
    data: {
      label: data.label,
      icon: data.icon,
      kind: data.kind,
      machineId: data.machineId,
      action: data.action,
      args: data.args as object,
      promptText: data.promptText,
      scheduledFor: data.scheduledFor,
      recurrence: data.recurrence,
      userId: auth.userId,
      sortOrder: count,
    },
    select: launcherSelect,
  });
  return NextResponse.json(row, { status: 201 });
}
