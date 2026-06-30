import { getToken } from "next-auth/jwt";
import { NextRequest, NextResponse } from "next/server";

import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { verifyUtSession, type UtClaims } from "@/lib/auth/ut-session";

const LOG_SOURCE = "APIAuth";

// Upsert l'utilisateur local (clé = email) depuis un compte UltraTales et renvoie son id.
async function utUserId(claims: UtClaims): Promise<string> {
  const user = await prisma.user.upsert({
    where: { email: claims.email },
    update: { name: claims.name || undefined },
    create: { email: claims.email, name: claims.name || null },
  });
  return user.id;
}

// Tente le SSO UltraTales sur une requête (cookie ut_session). Renvoie le userId local ou null.
async function tryUtSession(request: NextRequest): Promise<string | null> {
  const claims = await verifyUtSession(request.cookies.get("ut_session")?.value);
  if (!claims?.email) return null;
  return utUserId(claims);
}

/**
 * Authenticates a request and returns the user ID if authenticated
 * @param request The NextRequest object
 * @param logSource The source for logging
 * @returns An object with userId if authenticated, or a NextResponse if unauthorized
 */
export async function authenticateRequest(
  request: NextRequest,
  logSource: string
) {
  // Get the user token from the request
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  if (token?.sub) return { userId: token.sub };

  // Fallback SSO UltraTales (cookie ut_session)
  const utId = await tryUtSession(request);
  if (utId) return { userId: utId };

  logger.warn("Unauthorized access attempt to API", {}, logSource);
  return { response: new NextResponse("Unauthorized", { status: 401 }) };
}

/**
 * Middleware to ensure a user is authenticated for API routes
 * @param req The Next.js request object
 * @returns A response if authentication fails, or null if authentication succeeds
 */
export async function requireAuth(
  req: NextRequest
): Promise<NextResponse | null> {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

    if (!token) {
      // Fallback SSO UltraTales
      const utId = await tryUtSession(req);
      if (utId) return null;
      logger.warn(
        "Unauthenticated API access attempt",
        { path: req.nextUrl.pathname },
        LOG_SOURCE
      );
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return null; // Authentication successful
  } catch (error) {
    logger.error(
      "Error in API authentication",
      {
        error: error instanceof Error ? error.message : "Unknown error",
        path: req.nextUrl.pathname,
      },
      LOG_SOURCE
    );

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * Middleware to ensure a user is an admin for API routes
 * @param req The Next.js request object
 * @returns A response if authorization fails, or null if authorization succeeds
 */
export async function requireAdmin(
  req: NextRequest
): Promise<NextResponse | null> {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

    if (!token) {
      logger.warn(
        "Unauthenticated admin API access attempt",
        { path: req.nextUrl.pathname },
        LOG_SOURCE
      );
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (token.role !== "admin") {
      logger.warn(
        "Non-admin user attempted to access admin API",
        { userId: token.sub ?? "unknown", path: req.nextUrl.pathname },
        LOG_SOURCE
      );

      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return null; // Authorization successful
  } catch (error) {
    logger.error(
      "Error in API admin authorization",
      {
        error: error instanceof Error ? error.message : "Unknown error",
        path: req.nextUrl.pathname,
      },
      LOG_SOURCE
    );

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
