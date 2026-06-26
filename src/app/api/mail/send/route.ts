import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { loadAccount } from "@/lib/mail/account";
import { sendMail } from "@/lib/mail/smtp";
import { logger } from "@/lib/logger";

const LOG_SOURCE = "mail-send-route";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/mail/send — send a new message or a reply over the account's SMTP.
 * Body: accountId, to, subject, text; optional cc, html, inReplyTo, references[].
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

  const accountId = String(body.accountId ?? "");
  const to = String(body.to ?? "").trim();
  const subject = String(body.subject ?? "").trim();
  const text = body.text ? String(body.text) : undefined;
  const html = body.html ? String(body.html) : undefined;
  const cc = body.cc ? String(body.cc).trim() : undefined;
  const inReplyTo = body.inReplyTo ? String(body.inReplyTo) : undefined;
  const references = Array.isArray(body.references)
    ? body.references.map(String)
    : undefined;

  if (!accountId || !to) {
    return NextResponse.json(
      { error: "Recipient and account are required" },
      { status: 400 }
    );
  }
  if (!text && !html) {
    return NextResponse.json({ error: "Message body is empty" }, { status: 400 });
  }

  const account = await loadAccount(auth.userId, accountId);
  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  try {
    await sendMail(account.smtp, {
      to,
      cc,
      subject: subject || "(no subject)",
      text,
      html,
      inReplyTo,
      references,
    });
    return NextResponse.json({ status: "sent" });
  } catch (error) {
    logger.error(
      "Failed to send mail",
      {
        accountId,
        error: error instanceof Error ? error.message : String(error),
      },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Couldn't send. Check SMTP settings and try again." },
      { status: 502 }
    );
  }
}
