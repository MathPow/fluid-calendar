import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "mail-account-id-route";

const STATIONS = new Set(["personal", "work"]);

/** PATCH /api/mail/accounts/[id] — update station (personal/work) or label. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;

  const { id } = await params;
  const acct = await prisma.mailAccount.findFirst({
    where: { id, userId: auth.userId },
    select: { id: true },
  });
  if (!acct) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const data: { station?: string | null; displayName?: string } = {};
  if ("station" in body) {
    const s = body.station;
    data.station = typeof s === "string" && STATIONS.has(s) ? s : null;
  }
  if (typeof body.displayName === "string") {
    data.displayName = body.displayName.trim();
  }

  const updated = await prisma.mailAccount.update({
    where: { id: acct.id },
    data,
    select: { id: true, station: true, displayName: true },
  });
  return NextResponse.json({ account: updated });
}

/** DELETE /api/mail/accounts/[id] — disconnect an account. */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;

  const { id } = await params;
  const acct = await prisma.mailAccount.findFirst({
    where: { id, userId: auth.userId },
    select: { id: true },
  });
  if (!acct) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.mailAccount.delete({ where: { id: acct.id } });
  return NextResponse.json({ status: "deleted" });
}
