import { compare } from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import {
  STEP_UP_COOKIE,
  STEP_UP_TTL_S,
  issueStepUp,
  stepUpEnabled,
} from "@/lib/auth/step-up";
import { logger } from "@/lib/logger";

const LOG_SOURCE = "StepUp";
const MAX_FAILURES = 5;
const LOCK_MS = 15 * 60_000;

// Per-user failure count; in memory is enough for a single container.
const failures = new Map<string, { count: number; lockedUntil: number }>();

export const dynamic = "force-dynamic";

/** POST /api/auth/step-up — `{ pin }`; sets the step-up cookie for 15 min. */
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  if (!stepUpEnabled()) return NextResponse.json({ ok: true });

  const entry = failures.get(auth.userId) ?? { count: 0, lockedUntil: 0 };
  if (entry.lockedUntil > Date.now()) {
    return NextResponse.json(
      { error: "Trop d'essais. Réessaie dans 15 minutes." },
      { status: 429 }
    );
  }

  const body = await request.json().catch(() => null);
  const pin = typeof body?.pin === "string" ? body.pin : "";
  const ok = !!pin && (await compare(pin, process.env.STEPUP_PIN_HASH!));
  if (!ok) {
    entry.count += 1;
    if (entry.count >= MAX_FAILURES) {
      entry.count = 0;
      entry.lockedUntil = Date.now() + LOCK_MS;
    }
    failures.set(auth.userId, entry);
    logger.warn("Step-up PIN rejected", { userId: auth.userId }, LOG_SOURCE);
    return NextResponse.json({ error: "Code PIN incorrect" }, { status: 401 });
  }

  failures.delete(auth.userId);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(STEP_UP_COOKIE, issueStepUp(auth.userId), {
    httpOnly: true,
    sameSite: "strict",
    secure: (process.env.NEXTAUTH_URL ?? "").startsWith("https://"),
    path: "/api",
    maxAge: STEP_UP_TTL_S,
  });
  return res;
}
