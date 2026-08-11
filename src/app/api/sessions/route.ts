import { NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { TargetsSchema } from "@/lib/sessions/types";

const LOG_SOURCE = "sessions-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CreateSchema = z.object({
  title: z.string().trim().min(1).max(200),
  lexicon: z.string().max(20000).optional(),
  language: z.string().trim().max(10).optional(),
  model: z.string().trim().max(200).optional(),
  brief: z.string().max(50000).optional(),
  targets: TargetsSchema.optional(),
});

/** GET /api/sessions — list the user's work sessions (no digest/transcript bodies). */
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;

  try {
    const sessions = await prisma.workSession.findMany({
      where: { userId: auth.userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        status: true,
        statusError: true,
        language: true,
        compiledAt: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { recordings: true } },
        recordings: { select: { durationSec: true } },
      },
    });

    return NextResponse.json({
      sessions: sessions.map(({ recordings, _count, ...s }) => ({
        ...s,
        recordingCount: _count.recordings,
        totalDurationSec: recordings.reduce((sum, r) => sum + (r.durationSec ?? 0), 0),
      })),
    });
  } catch (error) {
    logger.error(
      "Failed to list sessions",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json({ error: "Failed to load sessions" }, { status: 500 });
  }
}

/** POST /api/sessions — create a session. Audio is attached separately. */
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected JSON body" }, { status: 400 });
  }

  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid session", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const session = await prisma.workSession.create({
      data: {
        userId: auth.userId,
        title: parsed.data.title,
        lexicon: parsed.data.lexicon ?? null,
        language: parsed.data.language ?? null,
        model: parsed.data.model ?? null,
        brief: parsed.data.brief ?? null,
        targets: parsed.data.targets ?? [],
      },
    });
    return NextResponse.json({ session }, { status: 201 });
  } catch (error) {
    logger.error(
      "Failed to create session",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json({ error: "Failed to create session" }, { status: 500 });
  }
}
