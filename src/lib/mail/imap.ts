import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

export interface MailAccountConn {
  imapHost: string;
  imapPort: number;
  username: string;
  password: string; // decrypted
}

export interface Address {
  name?: string;
  address?: string;
}

export interface MessageSummary {
  uid: number;
  subject: string;
  from: Address[];
  to: Address[];
  date: string | null;
  seen: boolean;
  flagged: boolean;
  hasAttachments: boolean;
}

export interface MessageDetail extends MessageSummary {
  cc: Address[];
  html: string | null;
  text: string | null;
  messageId: string | null;
  references: string[];
  attachments: { filename: string; size: number; contentType: string }[];
}

function makeClient(acct: MailAccountConn): ImapFlow {
  return new ImapFlow({
    host: acct.imapHost,
    port: acct.imapPort,
    secure: true,
    auth: { user: acct.username, pass: acct.password },
    logger: false,
    // Keep connections snappy; we open/close per request (live fetch model).
    emitLogs: false,
  });
}

/** Connect, run `fn`, and always log out. */
async function withClient<T>(
  acct: MailAccountConn,
  fn: (client: ImapFlow) => Promise<T>
): Promise<T> {
  const client = makeClient(acct);
  // ImapFlow emits 'error' on a dropped/refused connection; with no listener
  // Node treats it as uncaught and kills the process. The awaited call below
  // already rejects, so just swallow the event.
  client.on("error", () => undefined);
  await client.connect();
  try {
    return await fn(client);
  } finally {
    try {
      await client.logout();
    } catch {
      // ignore logout errors
    }
  }
}

/** Verify credentials by connecting and logging out. Throws on failure. */
export async function testConnection(acct: MailAccountConn): Promise<void> {
  await withClient(acct, async () => undefined);
}

/** List subscribed mailbox/folder paths. */
export async function listMailboxes(acct: MailAccountConn): Promise<string[]> {
  return withClient(acct, async (client) => {
    const boxes = await client.list();
    return boxes.map((b) => b.path);
  });
}

/**
 * The server's Trash folder. Prefers the IMAP SPECIAL-USE \Trash flag; falls
 * back to a name match for servers (like older ones) that don't advertise it.
 */
async function findTrash(client: ImapFlow): Promise<string | null> {
  const boxes = await client.list();
  const special = boxes.find((b) => b.specialUse === "\\Trash");
  if (special) return special.path;
  const want = /^(trash|corbeille|deleted items?|bin|papelera|papierkorb)$/i;
  const byName = boxes.find((b) => want.test(b.name));
  return byName?.path ?? null;
}

/**
 * Delete a message: move it to the server's Trash if there is one, otherwise
 * flag it \\Deleted and expunge in place. Deleting from Trash expunges.
 */
export async function deleteMessage(
  acct: MailAccountConn,
  mailbox: string,
  uid: number
): Promise<{ movedTo: string | null }> {
  return withClient(acct, async (client) => {
    const trash = await findTrash(client);
    const inTrash =
      trash !== null && trash.toLowerCase() === mailbox.toLowerCase();

    const lock = await client.getMailboxLock(mailbox);
    try {
      if (trash && !inTrash) {
        await client.messageMove(String(uid), trash, { uid: true });
        return { movedTo: trash };
      }
      // No Trash folder, or already in it: hard delete.
      await client.messageFlagsAdd(String(uid), ["\\Deleted"], { uid: true });
      await client.messageDelete(String(uid), { uid: true });
      return { movedTo: null };
    } finally {
      lock.release();
    }
  });
}

const addrList = (a: unknown): Address[] => {
  const arr = (a as { name?: string; address?: string }[] | undefined) ?? [];
  return arr.map((x) => ({ name: x.name, address: x.address }));
};

/**
 * List the newest messages in a mailbox (envelopes only — no bodies, for speed).
 * If `search` is given, runs an IMAP text search across subject/from/body.
 */
export async function listMessages(
  acct: MailAccountConn,
  mailbox: string,
  limit: number,
  search?: string
): Promise<MessageSummary[]> {
  return withClient(acct, (client) => listIn(client, mailbox, limit, search));
}

/** Folder kinds the unified « Toutes les boîtes » view can merge. */
export const MAIL_ROLES = [
  "inbox",
  "sent",
  "drafts",
  "archive",
  "junk",
  "trash",
] as const;
export type MailRole = (typeof MAIL_ROLES)[number];

const ROLE_SPECIAL_USE: Record<MailRole, string> = {
  inbox: "\\Inbox",
  sent: "\\Sent",
  drafts: "\\Drafts",
  archive: "\\Archive",
  junk: "\\Junk",
  trash: "\\Trash",
};

// Fallback names for servers that don't advertise SPECIAL-USE.
const ROLE_NAMES: Record<MailRole, RegExp> = {
  inbox: /^inbox$/i,
  sent: /^(sent|sent (messages|items|mail)|envoy[ée]s|[ée]l[ée]ments envoy[ée]s)$/i,
  drafts: /^(drafts?|brouillons?)$/i,
  archive: /^(archives?|all mail)$/i,
  junk: /^(junk|spam|junk e-?mail|bulk mail|ind[ée]sirables?|pourriels?)$/i,
  trash: /^(trash|corbeille|deleted (items?|messages)|bin)$/i,
};

/** This account's folder for a role, or null when it has none. */
async function findRole(
  client: ImapFlow,
  role: MailRole
): Promise<string | null> {
  if (role === "inbox") return "INBOX";
  const boxes = await client.list();
  const special = boxes.find((b) => b.specialUse === ROLE_SPECIAL_USE[role]);
  if (special) return special.path;
  return boxes.find((b) => ROLE_NAMES[role].test(b.name))?.path ?? null;
}

/**
 * List a role's folder (Sent, Trash…) whatever this server calls it — iCloud
 * says "Sent Messages", Gmail "[Gmail]/Sent Mail". Empty when it has none.
 */
export async function listRoleMessages(
  acct: MailAccountConn,
  role: MailRole,
  limit: number,
  search?: string
): Promise<{ mailbox: string | null; messages: MessageSummary[] }> {
  return withClient(acct, async (client) => {
    const mailbox = await findRole(client, role);
    if (!mailbox) return { mailbox: null, messages: [] };
    return { mailbox, messages: await listIn(client, mailbox, limit, search) };
  });
}

async function listIn(
  client: ImapFlow,
  mailbox: string,
  limit: number,
  search?: string
): Promise<MessageSummary[]> {
  const lock = await client.getMailboxLock(mailbox);
  try {
    let uids: number[];
    if (search && search.trim()) {
      const q = search.trim();
      const found = await client.search(
        { or: [{ subject: q }, { from: q }, { body: q }] },
        { uid: true }
      );
      uids = (found || []).slice(-limit);
    } else {
      const status = client.mailbox;
      const total = typeof status === "object" ? status.exists : 0;
      if (!total) return [];
      // Sequence range for the newest `limit` messages.
      const start = Math.max(1, total - limit + 1);
      const summaries: MessageSummary[] = [];
      for await (const msg of client.fetch(
        `${start}:*`,
        { uid: true, envelope: true, flags: true, bodyStructure: true },
        { uid: false }
      )) {
        summaries.push(toSummary(msg));
      }
      return summaries.sort((a, b) => b.uid - a.uid);
    }

    if (uids.length === 0) return [];
    const summaries: MessageSummary[] = [];
    for await (const msg of client.fetch(
      uids,
      { uid: true, envelope: true, flags: true, bodyStructure: true },
      { uid: true }
    )) {
      summaries.push(toSummary(msg));
    }
    return summaries.sort((a, b) => b.uid - a.uid);
  } finally {
    lock.release();
  }
}

function flagHasAttachment(bodyStructure: unknown): boolean {
  const node = bodyStructure as
    | { disposition?: string; childNodes?: unknown[] }
    | undefined;
  if (!node) return false;
  if (node.disposition === "attachment") return true;
  if (Array.isArray(node.childNodes)) {
    return node.childNodes.some((c) => flagHasAttachment(c));
  }
  return false;
}

function toSummary(msg: {
  uid: number;
  envelope?: { subject?: string; from?: unknown; to?: unknown; date?: Date };
  flags?: Set<string>;
  bodyStructure?: unknown;
}): MessageSummary {
  const flags = msg.flags ?? new Set<string>();
  return {
    uid: msg.uid,
    subject: msg.envelope?.subject || "(no subject)",
    from: addrList(msg.envelope?.from),
    to: addrList(msg.envelope?.to),
    date: msg.envelope?.date ? new Date(msg.envelope.date).toISOString() : null,
    seen: flags.has("\\Seen"),
    flagged: flags.has("\\Flagged"),
    hasAttachments: flagHasAttachment(msg.bodyStructure),
  };
}

/**
 * Fetch one full message (parsed) and mark it \Seen — unless `markSeen` is
 * false (the assistant reading on the user's behalf shouldn't flip it).
 */
export async function getMessage(
  acct: MailAccountConn,
  mailbox: string,
  uid: number,
  markSeen = true
): Promise<MessageDetail | null> {
  return withClient(acct, async (client) => {
    const lock = await client.getMailboxLock(mailbox);
    try {
      const msg = await client.fetchOne(
        String(uid),
        { uid: true, source: true, envelope: true, flags: true },
        { uid: true }
      );
      if (!msg || !msg.source) return null;

      const parsed = await simpleParser(msg.source as Buffer);
      // Mark as read (best effort).
      if (markSeen) {
        try {
          await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true });
        } catch {
          // ignore
        }
      }

      const refs = parsed.references
        ? Array.isArray(parsed.references)
          ? parsed.references
          : [parsed.references]
        : [];

      return {
        ...toSummary(msg as never),
        cc: addrList((msg.envelope as { cc?: unknown } | undefined)?.cc ?? []),
        html: typeof parsed.html === "string" ? parsed.html : null,
        text: parsed.text ?? null,
        messageId: parsed.messageId ?? null,
        references: refs,
        attachments: (parsed.attachments ?? []).map((a) => ({
          filename: a.filename || "attachment",
          size: a.size || 0,
          contentType: a.contentType || "application/octet-stream",
        })),
      };
    } finally {
      lock.release();
    }
  });
}

export interface ReplyToSent {
  uid: number;
  messageId: string | null;
  subject: string;
  from: Address[];
  date: string | null;
  /** Subject of the message of yours it answers. */
  repliesTo: string;
}

/**
 * Messages in INBOX from the last `days` that answer one of the messages sent
 * from this account in the last `sentDays` (their In-Reply-To is one of our
 * Message-IDs). Envelopes only; one connection.
 */
export async function listRepliesToSent(
  acct: MailAccountConn,
  days = 2,
  sentDays = 45
): Promise<ReplyToSent[]> {
  return withClient(acct, async (client) => {
    const boxes = await client.list();
    const sent =
      boxes.find((b) => b.specialUse === "\\Sent") ??
      boxes.find((b) => /^(sent|sent messages|sent items|envoy)/i.test(b.name));
    if (!sent) return [];

    const since = (d: number) => new Date(Date.now() - d * 86_400_000);
    const ours = new Map<string, string>();
    let lock = await client.getMailboxLock(sent.path);
    try {
      const uids =
        (await client.search({ since: since(sentDays) }, { uid: true })) || [];
      if (uids.length) {
        for await (const msg of client.fetch(
          uids.slice(-500),
          { envelope: true },
          { uid: true }
        )) {
          const id = msg.envelope?.messageId;
          if (id) ours.set(id, msg.envelope?.subject || "(sans objet)");
        }
      }
    } finally {
      lock.release();
    }
    if (ours.size === 0) return [];

    const replies: ReplyToSent[] = [];
    lock = await client.getMailboxLock("INBOX");
    try {
      const uids =
        (await client.search({ since: since(days) }, { uid: true })) || [];
      if (uids.length) {
        for await (const msg of client.fetch(
          uids.slice(-300),
          { uid: true, envelope: true },
          { uid: true }
        )) {
          const parent = msg.envelope?.inReplyTo;
          if (!parent || !ours.has(parent)) continue;
          replies.push({
            uid: msg.uid,
            messageId: msg.envelope?.messageId ?? null,
            subject: msg.envelope?.subject || "(sans objet)",
            from: addrList(msg.envelope?.from),
            date: msg.envelope?.date
              ? new Date(msg.envelope.date).toISOString()
              : null,
            repliesTo: ours.get(parent)!,
          });
        }
      }
    } finally {
      lock.release();
    }
    return replies;
  });
}
