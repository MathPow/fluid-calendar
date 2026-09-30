// Step-up PIN for the routes that run code on the machines (desktop
// commands, launchers, agent tokens). With the tailnet auto-login a device on
// the tailnet is enough to open DreamDash; these routes also want the PIN,
// proven by a short-lived signed cookie. On only when STEPUP_PIN_HASH (a
// bcrypt hash) is set.
import { createHmac, timingSafeEqual } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

export const STEP_UP_COOKIE = "dd_stepup";
export const STEP_UP_TTL_S = 15 * 60;

function key(): string {
  return `${process.env.NEXTAUTH_SECRET ?? ""}:step-up`;
}

function sign(userId: string, exp: number): string {
  return createHmac("sha256", key()).update(`${userId}.${exp}`).digest("hex");
}

export function stepUpEnabled(): boolean {
  return !!process.env.STEPUP_PIN_HASH;
}

/** The cookie value proving the PIN for `userId` until now + TTL. */
export function issueStepUp(userId: string): string {
  const exp = Math.floor(Date.now() / 1000) + STEP_UP_TTL_S;
  return `${exp}.${sign(userId, exp)}`;
}

function validStepUp(value: string | undefined, userId: string): boolean {
  if (!value) return false;
  const [expRaw, mac] = value.split(".");
  const exp = Number(expRaw);
  if (!exp || !mac || exp < Date.now() / 1000) return false;
  const want = Buffer.from(sign(userId, exp), "hex");
  const got = Buffer.from(mac, "hex");
  return want.length === got.length && timingSafeEqual(want, got);
}

/** null when the PIN was given recently (or step-up is off), else a 403 the
 * client's StepUpProvider turns into the PIN dialog. */
export function requireStepUp(
  request: NextRequest,
  userId: string
): NextResponse | null {
  if (!stepUpEnabled()) return null;
  if (validStepUp(request.cookies.get(STEP_UP_COOKIE)?.value, userId)) {
    return null;
  }
  return NextResponse.json(
    { error: "step_up_required", message: "Code PIN requis" },
    { status: 403 }
  );
}
