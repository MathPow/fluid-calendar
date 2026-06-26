import nodemailer from "nodemailer";

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
  subject: string;
  text?: string;
  html?: string;
  inReplyTo?: string;
  references?: string[];
}

/** Send a message over the account's SMTP server. */
export async function sendMail(conn: SmtpConn, mail: OutgoingMail): Promise<void> {
  const transport = nodemailer.createTransport({
    host: conn.smtpHost,
    port: conn.smtpPort,
    secure: conn.smtpPort === 465, // 465 = implicit TLS, 587 = STARTTLS
    auth: { user: conn.username, pass: conn.password },
  });

  await transport.sendMail({
    from: conn.fromName
      ? { name: conn.fromName, address: conn.fromEmail }
      : conn.fromEmail,
    to: mail.to,
    cc: mail.cc || undefined,
    subject: mail.subject,
    text: mail.text || undefined,
    html: mail.html || undefined,
    inReplyTo: mail.inReplyTo || undefined,
    references: mail.references?.length ? mail.references : undefined,
  });
}
