import type { MailAccount } from "@prisma/client";

import { prisma } from "@/lib/prisma";

import { decryptSecret } from "./crypto";
import type { MailAccountConn } from "./imap";
import type { SmtpConn } from "./smtp";

export interface LoadedAccount {
  id: string;
  email: string;
  displayName: string | null;
  provider: string;
  imap: MailAccountConn;
  smtp: SmtpConn;
}

/**
 * Load a user's mail account and decrypt its password into ready-to-use IMAP +
 * SMTP connection configs. Returns null if the account doesn't belong to the
 * user (or doesn't exist).
 */
export async function loadAccount(
  userId: string,
  accountId: string
): Promise<LoadedAccount | null> {
  const acct = await prisma.mailAccount.findFirst({
    where: { id: accountId, userId },
  });
  return acct ? toLoaded(acct) : null;
}

/**
 * Load every mail account of a user (optionally only the given ids), oldest
 * first — used by the unified « Toutes les boîtes » view.
 */
export async function loadAccounts(
  userId: string,
  accountIds?: string[]
): Promise<LoadedAccount[]> {
  const accts = await prisma.mailAccount.findMany({
    where: {
      userId,
      ...(accountIds ? { id: { in: accountIds } } : {}),
    },
    orderBy: { createdAt: "asc" },
  });
  return accts.map(toLoaded);
}

function toLoaded(acct: MailAccount): LoadedAccount {
  const password = decryptSecret(acct.passwordEnc);
  return {
    id: acct.id,
    email: acct.email,
    displayName: acct.displayName,
    provider: acct.provider,
    imap: {
      imapHost: acct.imapHost,
      imapPort: acct.imapPort,
      username: acct.username,
      password,
    },
    smtp: {
      smtpHost: acct.smtpHost,
      smtpPort: acct.smtpPort,
      username: acct.username,
      password,
      fromEmail: acct.email,
      fromName: acct.displayName ?? undefined,
    },
  };
}
