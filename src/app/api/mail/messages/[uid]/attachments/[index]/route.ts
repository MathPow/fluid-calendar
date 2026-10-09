import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";
import { loadAccount } from "@/lib/mail/account";
import { getAttachment } from "@/lib/mail/imap";

const LOG_SOURCE = "mail-attachment-route";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/mail/messages/[uid]/attachments/[index]?accountId=&mailbox=INBOX
 * Downloads one attachment (index into the message's `attachments` list).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ uid: string; index: string }> }
) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;

  const { uid, index } = await params;
  const uidNum = Number(uid);
  const indexNum = Number(index);
  if (
    !Number.isInteger(uidNum) ||
    !Number.isInteger(indexNum) ||
    indexNum < 0
  ) {
    return NextResponse.json({ error: "Bad uid or index" }, { status: 400 });
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
    const file = await getAttachment(account.imap, mailbox, uidNum, indexNum);
    if (!file) {
      return NextResponse.json(
        { error: "Attachment not found" },
        { status: 404 }
      );
    }
    // ASCII fallback for old clients, the real name in filename*.
    const ascii = file.filename.replace(/[^\x20-\x7e]|["\\]/g, "_");
    return new NextResponse(new Uint8Array(file.content), {
      headers: {
        "Content-Type": file.contentType,
        "Content-Length": String(file.content.length),
        "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    logger.error(
      "Failed to fetch attachment",
      {
        accountId,
        mailbox,
        uid: uidNum,
        index: indexNum,
        error: error instanceof Error ? error.message : String(error),
      },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Couldn't download that attachment." },
      { status: 502 }
    );
  }
}
