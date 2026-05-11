import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request, "PushUnsubscribeAPI");
  if ("response" in auth) return auth.response;

  const body = (await request.json()) as { endpoint: string };

  if (!body.endpoint) {
    return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });
  }

  await prisma.pushSubscription.deleteMany({
    where: { endpoint: body.endpoint, userId: auth.userId },
  });

  return NextResponse.json({ ok: true });
}
