import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { sendPushToUser } from "@/lib/push-notifications";

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request, "PushTestAPI");
  if ("response" in auth) return auth.response;

  await sendPushToUser(auth.userId, {
    title: "DreamDash",
    body: "Push notifications are working! ⚡",
    url: "/calendar",
  });

  return NextResponse.json({ ok: true });
}
