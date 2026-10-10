import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";
import { loadAccount } from "@/lib/mail/account";
import { getAttachments, saveToSent } from "@/lib/mail/imap";
import { type OutgoingMail, sendMail } from "@/lib/mail/smtp";

const LOG_SOURCE = "mail-send-route";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Most servers refuse a message over ~25 MB once base64 has inflated it. */
const MAX_ATTACHMENTS_BYTES = 20 * 1024 * 1024;

/**
 * POST /api/mail/send — send a new message, a reply or a forward over the
 * account's SMTP, then file a copy in its Sent folder.
 *
 * JSON body, or multipart/form-data with that JSON in a `payload` field and
 * the files to attach in `files`. Fields: accountId, to, subject, text;
 * optional cc, bcc, html, inReplyTo, references[], and forward
 * { accountId, mailbox, uid, attachments: number[] } to carry the original
 * message's attachments (by index) along.
 */
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;

  let body: Record<string, unknown>;
  const uploads: File[] = [];
  try {
    if (request.headers.get("content-type")?.includes("multipart/form-data")) {
      const form = await request.formData();
      body = JSON.parse(String(form.get("payload") ?? "{}"));
      for (const f of form.getAll("files")) {
        if (typeof f !== "string") uploads.push(f);
      }
    } else {
      body = await request.json();
    }
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const accountId = String(body.accountId ?? "");
  const to = String(body.to ?? "").trim();
  const subject = String(body.subject ?? "").trim();
  const text = body.text ? String(body.text) : undefined;
  const html = body.html ? String(body.html) : undefined;
  const cc = body.cc ? String(body.cc).trim() : undefined;
  const bcc = body.bcc ? String(body.bcc).trim() : undefined;
  const inReplyTo = body.inReplyTo ? String(body.inReplyTo) : undefined;
  const references = Array.isArray(body.references)
    ? body.references.map(String)
    : undefined;
  const forward = parseForward(body.forward);

  if (!accountId || !(to || cc || bcc)) {
    return NextResponse.json(
      { error: "Recipient and account are required" },
      { status: 400 }
    );
  }
  if (!text && !html && uploads.length === 0 && !forward) {
    return NextResponse.json(
      { error: "Message body is empty" },
      { status: 400 }
    );
  }

  const account = await loadAccount(auth.userId, accountId);
  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  const attachments: NonNullable<OutgoingMail["attachments"]> = [];
  for (const f of uploads) {
    attachments.push({
      filename: f.name || "attachment",
      content: Buffer.from(await f.arrayBuffer()),
      contentType: f.type || undefined,
    });
  }
  if (forward && forward.attachments.length > 0) {
    // The original may sit in another of the user's boxes.
    const source =
      forward.accountId === accountId
        ? account
        : await loadAccount(auth.userId, forward.accountId);
    if (!source) {
      return NextResponse.json(
        { error: "Original message's account not found" },
        { status: 404 }
      );
    }
    try {
      const files = await getAttachments(
        source.imap,
        forward.mailbox,
        forward.uid,
        forward.attachments
      );
      if (!files) {
        return NextResponse.json(
          { error: "Original message not found" },
          { status: 404 }
        );
      }
      attachments.push(...files);
    } catch (error) {
      logger.error(
        "Failed to fetch forwarded attachments",
        {
          accountId: forward.accountId,
          error: error instanceof Error ? error.message : String(error),
        },
        LOG_SOURCE
      );
      return NextResponse.json(
        { error: "Couldn't fetch the original attachments." },
        { status: 502 }
      );
    }
  }
  const total = attachments.reduce((n, a) => n + a.content.length, 0);
  if (total > MAX_ATTACHMENTS_BYTES) {
    return NextResponse.json(
      { error: "Attachments are over 20 MB" },
      { status: 413 }
    );
  }

  let sent: Awaited<ReturnType<typeof sendMail>>;
  try {
    sent = await sendMail(account.smtp, {
      to,
      cc,
      bcc,
      subject: subject || "(no subject)",
      text,
      html,
      inReplyTo,
      references,
      attachments,
    });
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

  // Off the response path: give a server that keeps its own copy a moment to
  // file it, then add ours only if it didn't.
  setTimeout(() => {
    saveToSent(account.imap, sent.raw, sent.messageId).catch((error) =>
      logger.error(
        "Failed to file sent mail",
        {
          accountId,
          error: error instanceof Error ? error.message : String(error),
        },
        LOG_SOURCE
      )
    );
  }, 4000);

  return NextResponse.json({ status: "sent", messageId: sent.messageId });
}

function parseForward(v: unknown) {
  if (!v || typeof v !== "object") return null;
  const f = v as Record<string, unknown>;
  const uid = Number(f.uid);
  if (!f.accountId || !Number.isInteger(uid)) return null;
  return {
    accountId: String(f.accountId),
    mailbox: String(f.mailbox || "INBOX"),
    uid,
    attachments: Array.isArray(f.attachments)
      ? f.attachments.map(Number).filter((i) => Number.isInteger(i) && i >= 0)
      : [],
  };
}
