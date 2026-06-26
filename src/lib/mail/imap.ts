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
  return withClient(acct, async (client) => {
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
  });
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

/** Fetch one full message (parsed) and mark it \Seen. */
export async function getMessage(
  acct: MailAccountConn,
  mailbox: string,
  uid: number
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
      try {
        await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true });
      } catch {
        // ignore
      }

      const refs = parsed.references
        ? Array.isArray(parsed.references)
          ? parsed.references
          : [parsed.references]
        : [];

      return {
        ...toSummary(msg as never),
        cc: addrList(
          (msg.envelope as { cc?: unknown } | undefined)?.cc ?? []
        ),
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
