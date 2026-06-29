import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";
import { encryptSecret } from "@/lib/mail/crypto";
import { testConnection } from "@/lib/mail/imap";
import { presetFor } from "@/lib/mail/providers";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "mail-accounts-route";

export const dynamic = "force-dynamic";

/** GET /api/mail/accounts — list connected accounts (never returns passwords). */
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;

  const accounts = await prisma.mailAccount.findMany({
    where: { userId: auth.userId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      provider: true,
      displayName: true,
      email: true,
      imapHost: true,
      smtpHost: true,
      station: true,
      createdAt: true,
    },
  });
  return NextResponse.json({ accounts });
}

/**
 * POST /api/mail/accounts — connect a new account. Body:
 *   provider ("icloud" | "zoho" | "imap"), email, password,
 *   displayName?, and for "imap": imapHost/imapPort/smtpHost/smtpPort.
 * The connection is tested before saving; the password is stored encrypted.
 */
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const provider = String(body.provider ?? "").toLowerCase();
  const email = String(body.email ?? "").trim();
  const password = String(body.password ?? "");
  const displayName = body.displayName
    ? String(body.displayName).trim()
    : null;

  if (!email || !password) {
    return NextResponse.json(
      { error: "Email and password are required" },
      { status: 400 }
    );
  }

  const preset = presetFor(provider);
  if (!preset) {
    return NextResponse.json({ error: "Unknown provider" }, { status: 400 });
  }

  // For generic IMAP, hosts come from the request; presets supply the rest.
  const imapHost =
    provider === "imap" ? String(body.imapHost ?? "").trim() : preset.imapHost;
  const smtpHost =
    provider === "imap" ? String(body.smtpHost ?? "").trim() : preset.smtpHost;
  const imapPort = Number(body.imapPort ?? preset.imapPort) || preset.imapPort;
  const smtpPort = Number(body.smtpPort ?? preset.smtpPort) || preset.smtpPort;
  const username = body.username ? String(body.username).trim() : email;

  if (!imapHost || !smtpHost) {
    return NextResponse.json(
      { error: "IMAP and SMTP hosts are required" },
      { status: 400 }
    );
  }

  // Verify credentials before persisting anything.
  try {
    await testConnection({ imapHost, imapPort, username, password });
  } catch (error) {
    logger.warn(
      "Mail account connection test failed",
      { email, error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json(
      {
        error:
          "Couldn't sign in. Check the address and app-specific password.",
      },
      { status: 400 }
    );
  }

  try {
    const created = await prisma.mailAccount.upsert({
      where: { userId_email: { userId: auth.userId, email } },
      create: {
        userId: auth.userId,
        provider,
        displayName,
        email,
        imapHost,
        imapPort,
        smtpHost,
        smtpPort,
        username,
        passwordEnc: encryptSecret(password),
      },
      update: {
        provider,
        displayName,
        imapHost,
        imapPort,
        smtpHost,
        smtpPort,
        username,
        passwordEnc: encryptSecret(password),
      },
      select: { id: true, email: true, provider: true, displayName: true },
    });
    return NextResponse.json({ account: created }, { status: 201 });
  } catch (error) {
    logger.error(
      "Failed to save mail account",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Failed to save account" },
      { status: 500 }
    );
  }
}
