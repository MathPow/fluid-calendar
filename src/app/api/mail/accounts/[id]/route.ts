import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "mail-account-id-route";

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
