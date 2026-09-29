import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { loadAccount, loadAccounts } from "@/lib/mail/account";
import { listMailboxes, listMessages } from "@/lib/mail/imap";
import { logger } from "@/lib/logger";

const LOG_SOURCE = "mail-messages-route";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Pseudo account id for the unified « Toutes les boîtes » view. */
const ALL_ACCOUNTS = "all";

/**
 * GET /api/mail/messages?accountId=&mailbox=INBOX&limit=30&q=&folders=1
 * Lists message envelopes for a mailbox (live IMAP fetch). With folders=1 it
 * also returns the account's mailbox list for the sidebar.
 *
 * accountId=all (+ optional accounts=id1,id2 to restrict, e.g. to the active
 * station) merges the newest `limit` messages of every account's mailbox,
 * newest first; each message carries its accountId + mailbox. Accounts that
 * fail to answer are listed in `failed` instead of failing the whole view.
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

  if (accountId === ALL_ACCOUNTS) {
    // An empty `accounts=` means "none visible", not "every account".
    const ids = sp.has("accounts")
      ? (sp.get("accounts") || "").split(",").filter(Boolean)
      : undefined;
    return listAllAccounts(auth.userId, ids, mailbox, limit, q);
  }

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

/** Fan out to every account in parallel and merge the results by date. */
async function listAllAccounts(
  userId: string,
  accountIds: string[] | undefined,
  mailbox: string,
  limit: number,
  q: string | undefined
) {
  const accounts = await loadAccounts(userId, accountIds);
  const results = await Promise.allSettled(
    accounts.map((a) => listMessages(a.imap, mailbox, limit, q))
  );

  const failed: { accountId: string; email: string }[] = [];
  const messages = results.flatMap((r, i) => {
    const account = accounts[i];
    if (r.status === "rejected") {
      logger.error(
        "Failed to list mail (unified view)",
        {
          accountId: account.id,
          mailbox,
          error:
            r.reason instanceof Error ? r.reason.message : String(r.reason),
        },
        LOG_SOURCE
      );
      failed.push({ accountId: account.id, email: account.email });
      return [];
    }
    return r.value.map((m) => ({ ...m, accountId: account.id, mailbox }));
  });

  if (accounts.length > 0 && failed.length === accounts.length) {
    return NextResponse.json(
      { error: "Couldn't reach the mail server." },
      { status: 502 }
    );
  }

  // Newest first; undated messages sink to the bottom.
  const time = (d: string | null) => (d ? Date.parse(d) || 0 : 0);
  messages.sort((a, b) => time(b.date) - time(a.date));
  return NextResponse.json({ messages, failed });
}
