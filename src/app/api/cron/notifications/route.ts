import { NextRequest, NextResponse } from "next/server";

import { runDueRecurring } from "@/lib/facturation/service";
import { logger } from "@/lib/logger";
import { loadAccounts } from "@/lib/mail/account";
import { listRepliesToSent } from "@/lib/mail/imap";
import { notify } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "notifications-cron";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Replies older than this are recorded without a push (first scan, backlog).
const PUSH_WINDOW_MS = 6 * 3_600_000;

/**
 * POST /api/cron/notifications (x-cron-secret) — polls the sources that can't
 * call us: replies to emails you sent, on every mail account. Also issues
 * the recurring invoices that are due.
 * Called every few minutes by the host cron.
 */
export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Recurring invoices (subscriptions) ride on the same 5-minute tick.
  const invoices = await runDueRecurring().catch((error) => {
    logger.error(
      "Recurring invoices run failed",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return null;
  });

  const users = await prisma.user.findMany({
    where: { mailAccounts: { some: {} } },
    select: { id: true },
  });

  let created = 0;
  const failed: string[] = [];
  for (const user of users) {
    const accounts = await loadAccounts(user.id);
    for (const account of accounts) {
      try {
        const replies = await listRepliesToSent(account.imap);
        for (const r of replies) {
          const who = r.from[0]?.name || r.from[0]?.address || "Quelqu'un";
          const at = r.date ? new Date(r.date) : new Date();
          const row = await notify(user.id, {
            kind: "email_reply",
            source: "email",
            important: true,
            silent: Date.now() - at.getTime() > PUSH_WINDOW_MS,
            title: `${who} a répondu`,
            body: `« ${r.repliesTo} »${r.subject !== r.repliesTo ? `\n${r.subject}` : ""}`,
            url: "/email",
            dedupeKey: `email-reply:${r.messageId ?? `${account.id}:${r.uid}`}`,
            createdAt: at,
          });
          if (row) created++;
        }
      } catch (error) {
        failed.push(account.email);
        logger.warn(
          "Reply scan failed",
          {
            account: account.email,
            error: error instanceof Error ? error.message : String(error),
          },
          LOG_SOURCE
        );
      }
    }
  }
  return NextResponse.json({ ok: true, created, failed, invoices });
}
