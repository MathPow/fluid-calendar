import { randomUUID } from "crypto";
import nodemailer from "nodemailer";
import MailComposer from "nodemailer/lib/mail-composer";

export interface SmtpConn {
  smtpHost: string;
  smtpPort: number;
  username: string;
  password: string; // decrypted
  fromEmail: string;
  fromName?: string;
}

export interface OutgoingMail {
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  text?: string;
  html?: string;
  inReplyTo?: string;
  references?: string[];
  attachments?: { filename: string; content: Buffer; contentType?: string }[];
}

/**
 * Send a message over the account's SMTP server. Returns its Message-ID and
 * the raw RFC 822 copy (without Bcc) so it can be filed in Sent.
 */
export async function sendMail(
  conn: SmtpConn,
  mail: OutgoingMail
): Promise<{ messageId: string; raw: Buffer }> {
  const transport = nodemailer.createTransport({
    host: conn.smtpHost,
    port: conn.smtpPort,
    secure: conn.smtpPort === 465, // 465 = implicit TLS, 587 = STARTTLS
    auth: { user: conn.username, pass: conn.password },
  });

  const domain = conn.fromEmail.split("@")[1] || "localhost";
  const options = {
    from: conn.fromName
      ? { name: conn.fromName, address: conn.fromEmail }
      : conn.fromEmail,
    to: mail.to,
    cc: mail.cc || undefined,
    bcc: mail.bcc || undefined,
    subject: mail.subject,
    text: mail.text || undefined,
    html: mail.html || undefined,
    inReplyTo: mail.inReplyTo || undefined,
    references: mail.references?.length ? mail.references : undefined,
    attachments: mail.attachments?.length ? mail.attachments : undefined,
    // Fixed so the Sent copy matches what went out.
    messageId: `<${randomUUID()}@${domain}>`,
    date: new Date(),
  };

  await transport.sendMail(options);
  const raw = await new MailComposer(options).compile().build();
  return { messageId: options.messageId, raw };
}
