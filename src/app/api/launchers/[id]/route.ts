import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { LauncherInput } from "@/lib/launchers";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "launcher-api";

type Ctx = { params: Promise<{ id: string }> };

/** PATCH /api/launchers/[id] — replace the button's fields (full form). */
export async function PATCH(request: NextRequest, { params }: Ctx) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const { id } = await params;
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
  const { count } = await prisma.launchShortcut.updateMany({
    where: { id, userId: auth.userId },
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
    },
  });
  if (!count)
    return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

/** DELETE /api/launchers/[id] */
export async function DELETE(request: NextRequest, { params }: Ctx) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const { id } = await params;
  await prisma.launchShortcut.deleteMany({
    where: { id, userId: auth.userId },
  });
  return NextResponse.json({ ok: true });
}
