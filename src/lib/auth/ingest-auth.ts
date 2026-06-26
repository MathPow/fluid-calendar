import { NextRequest, NextResponse } from "next/server";

import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { safeEqual } from "@/lib/recordings/storage";

/**
 * Auth for unattended capture clients (Meetily, iPhone/Apple Watch Shortcuts)
 * that can't perform a NextAuth browser login. They authenticate with a static
 * key in the `X-Api-Key` header, matched against RECORDINGS_API_KEY.
 *
 * The recording is attributed to the user identified by RECORDINGS_USER_EMAIL,
 * or — on a single-user box — the only/first user if that env is unset.
 */
export async function authenticateIngest(
  request: NextRequest,
  logSource: string
): Promise<{ userId: string } | { response: NextResponse }> {
  const expected = process.env.RECORDINGS_API_KEY;
  if (!expected) {
    logger.error(
      "Recordings ingest attempted but RECORDINGS_API_KEY is not set",
      {},
      logSource
    );
    return {
      response: NextResponse.json(
        { error: "Ingest not configured" },
        { status: 503 }
      ),
    };
  }

  const provided = request.headers.get("x-api-key") ?? "";
  if (!provided || !safeEqual(provided, expected)) {
    logger.warn("Recordings ingest rejected: bad API key", {}, logSource);
    return { response: new NextResponse("Unauthorized", { status: 401 }) };
  }

  const ownerEmail = process.env.RECORDINGS_USER_EMAIL;
  const user = ownerEmail
    ? await prisma.user.findUnique({ where: { email: ownerEmail } })
    : await prisma.user.findFirst({ orderBy: { id: "asc" } });

  if (!user) {
    logger.error(
      "Recordings ingest could not resolve an owning user",
      { ownerEmail: ownerEmail ?? null },
      logSource
    );
    return {
      response: NextResponse.json(
        { error: "No user to attribute the recording to" },
        { status: 500 }
      ),
    };
  }

  return { userId: user.id };
}
