import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";
import { loadAccount } from "@/lib/mail/account";
import { deleteMessage, getMessage } from "@/lib/mail/imap";

const LOG_SOURCE = "mail-message-detail-route";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/mail/messages/[uid]?accountId=&mailbox=INBOX
 * Fetches and parses a full message (marks it read).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ uid: string }> }
) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;

  const { uid } = await params;
  const uidNum = Number(uid);
  if (!Number.isFinite(uidNum)) {
    return NextResponse.json({ error: "Bad uid" }, { status: 400 });
  }

  const sp = request.nextUrl.searchParams;
  const accountId = sp.get("accountId");
  const mailbox = sp.get("mailbox") || "INBOX";
  if (!accountId) {
    return NextResponse.json({ error: "Missing accountId" }, { status: 400 });
  }

  const account = await loadAccount(auth.userId, accountId);
  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  try {
    const message = await getMessage(account.imap, mailbox, uidNum);
    if (!message) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }
    return NextResponse.json({ message });
  } catch (error) {
    logger.error(
      "Failed to fetch message",
      {
        accountId,
        uid: uidNum,
        error: error instanceof Error ? error.message : String(error),
      },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Couldn't load that message." },
      { status: 502 }
    );
  }
}

/**
 * DELETE /api/mail/messages/[uid]?accountId=&mailbox=INBOX
 * Moves the message to Trash, or expunges it when already there.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ uid: string }> }
) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;

  const { uid } = await params;
  const uidNum = Number(uid);
  if (!Number.isFinite(uidNum)) {
    return NextResponse.json({ error: "Bad uid" }, { status: 400 });
  }

  const sp = request.nextUrl.searchParams;
  const accountId = sp.get("accountId");
  const mailbox = sp.get("mailbox") || "INBOX";
  if (!accountId) {
    return NextResponse.json({ error: "Missing accountId" }, { status: 400 });
  }

  const account = await loadAccount(auth.userId, accountId);
  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  try {
    const result = await deleteMessage(account.imap, mailbox, uidNum);
    return NextResponse.json(result);
  } catch (error) {
    logger.error(
      "Failed to delete message",
      {
        accountId,
        mailbox,
        uid: uidNum,
        error: error instanceof Error ? error.message : String(error),
      },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Couldn't delete that message." },
      { status: 502 }
    );
  }
}
