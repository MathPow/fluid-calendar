import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { loadAccount } from "@/lib/mail/account";
import { listMailboxes, listMessages } from "@/lib/mail/imap";
import { logger } from "@/lib/logger";

const LOG_SOURCE = "mail-messages-route";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/mail/messages?accountId=&mailbox=INBOX&limit=30&q=&folders=1
 * Lists message envelopes for a mailbox (live IMAP fetch). With folders=1 it
 * also returns the account's mailbox list for the sidebar.
 */
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;

  const sp = request.nextUrl.searchParams;
  const accountId = sp.get("accountId");
  if (!accountId) {
    return NextResponse.json({ error: "Missing accountId" }, { status: 400 });
  }
  const mailbox = sp.get("mailbox") || "INBOX";
  const limit = Math.min(Math.max(Number(sp.get("limit")) || 30, 1), 100);
  const q = sp.get("q") || undefined;
  const wantFolders = sp.get("folders") === "1";

  const account = await loadAccount(auth.userId, accountId);
  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  try {
    const [messages, folders] = await Promise.all([
      listMessages(account.imap, mailbox, limit, q),
      wantFolders ? listMailboxes(account.imap) : Promise.resolve(undefined),
    ]);
    return NextResponse.json({ messages, ...(folders ? { folders } : {}) });
  } catch (error) {
    logger.error(
      "Failed to list mail",
      {
        accountId,
        mailbox,
        error: error instanceof Error ? error.message : String(error),
      },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Couldn't reach the mail server." },
      { status: 502 }
    );
  }
}
