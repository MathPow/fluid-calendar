import { encode } from "next-auth/jwt";
import { NextRequest, NextResponse } from "next/server";

import { allowedTailnetLogin, fromTailnetProxy } from "@/lib/auth/tailnet";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "TailnetAuth";
const SESSION_MAX_AGE = 30 * 24 * 60 * 60; // 30 days, re-minted on expiry

export const dynamic = "force-dynamic";

/** Only same-origin paths, never `//host` or an absolute URL. */
function safeCallback(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

function publicOrigin(): string {
  return process.env.NEXTAUTH_URL || "http://localhost:3000";
}

function denied(reason: string) {
  logger.warn("Tailnet auto-login refused", { reason }, LOG_SOURCE);
  const url = new URL("/auth/signin", publicOrigin());
  url.searchParams.set("error", "TailnetDenied");
  return NextResponse.redirect(url);
}

/**
 * GET /api/auth/tailnet?callbackUrl=/path — mint the NextAuth session cookie
 * for a request that came through the Caddy tailnet node, then go back.
 * The middleware sends session-less tailnet requests here.
 */
export async function GET(request: NextRequest) {
  if (!fromTailnetProxy(request.headers)) return denied("not via proxy");

  const login = allowedTailnetLogin(request.headers);
  if (!login) {
    return denied(
      `login not allowed: ${request.headers.get("x-tailscale-user") ?? "none"}`
    );
  }

  const email = process.env.TAILNET_APP_USER_EMAIL;
  if (!email) return denied("TAILNET_APP_USER_EMAIL unset");
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, name: true, image: true, role: true },
  });
  if (!user) return denied(`no app user ${email}`);

  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) return denied("NEXTAUTH_SECRET unset");

  const token = await encode({
    secret,
    maxAge: SESSION_MAX_AGE,
    token: {
      sub: user.id,
      email: user.email,
      name: user.name,
      picture: user.image,
      role: user.role,
      via: "tailnet",
      tailnetLogin: login,
    },
  });

  const secure = publicOrigin().startsWith("https://");
  const res = NextResponse.redirect(
    new URL(
      safeCallback(request.nextUrl.searchParams.get("callbackUrl")),
      publicOrigin()
    )
  );
  res.cookies.set(
    secure ? "__Secure-next-auth.session-token" : "next-auth.session-token",
    token,
    {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure,
      maxAge: SESSION_MAX_AGE,
    }
  );
  logger.info("Tailnet auto-login", { login, userId: user.id }, LOG_SOURCE);
  return res;
}
