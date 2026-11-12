import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

/** Sending hours are Québec business hours, wherever the server runs. */
export const CAMPAIGN_TZ = "America/Toronto";

/** Failures in a row before a campaign stops itself. */
export const MAX_CONSECUTIVE_FAILURES = 3;
/** Attempts for one recipient when the server fails temporarily. */
export const MAX_ATTEMPTS = 3;
export const RETRY_DELAY_MS = 30 * 60_000;
/** A message still "sending" after this was cut off: it may or may not have left. */
export const STALE_SENDING_MS = 10 * 60_000;
/** The cron sends one message per account on each of its 5-minute runs. */
export const TICK_MINUTES = 5;

const EMAIL_RE = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:".]{2,}$/;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim());
}

/** RFC 4180 CSV: quoted fields can hold commas, quotes and line breaks. */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  row.push(field);
  if (row.some((value) => value.trim() !== "")) rows.push(row);
  return rows;
}

const COLUMNS = {
  email: ["courriel", "email", "e-mail", "adresse"],
  subject: ["objet", "subject", "sujet"],
  body: ["corps", "body", "message", "texte"],
  organisation: ["organisation", "organization", "entreprise", "nom", "name"],
  reviewNote: ["à réviser", "a reviser", "review", "note"],
} as const;

export interface CampaignRow {
  email: string;
  subject: string;
  body: string;
  organisation: string | null;
  reviewNote: string | null;
}

export type ImportIssue =
  | { code: "missingColumns"; columns: string }
  | { code: "invalidEmail"; line: number; value: string }
  | { code: "duplicate"; line: number; value: string }
  | { code: "emptyMessage"; line: number; value: string };

/** One message per row. Bad rows are left out and reported, not guessed at. */
export function parseCampaignCsv(text: string): {
  rows: CampaignRow[];
  issues: ImportIssue[];
} {
  const table = parseCsv(text);
  const header = (table[0] ?? []).map((name) => name.trim().toLowerCase());
  const column = (names: readonly string[]) =>
    header.findIndex((name) => names.includes(name));
  const at = {
    email: column(COLUMNS.email),
    subject: column(COLUMNS.subject),
    body: column(COLUMNS.body),
    organisation: column(COLUMNS.organisation),
    reviewNote: column(COLUMNS.reviewNote),
  };

  const missing = (["email", "subject", "body"] as const).filter(
    (name) => at[name] < 0
  );
  if (missing.length > 0) {
    return {
      rows: [],
      issues: [{ code: "missingColumns", columns: missing.join(", ") }],
    };
  }

  const rows: CampaignRow[] = [];
  const issues: ImportIssue[] = [];
  const seen = new Set<string>();
  table.slice(1).forEach((cells, index) => {
    const line = index + 2;
    const read = (i: number) => (i >= 0 ? (cells[i] ?? "").trim() : "");
    const raw = read(at.email);
    const email = normalizeEmail(raw);
    if (!isValidEmail(email))
      return issues.push({ code: "invalidEmail", line, value: raw });
    if (seen.has(email))
      return issues.push({ code: "duplicate", line, value: email });
    const subject = read(at.subject);
    const body = read(at.body);
    if (!subject || !body)
      return issues.push({ code: "emptyMessage", line, value: email });
    seen.add(email);
    rows.push({
      email,
      subject,
      body,
      organisation: read(at.organisation) || null,
      reviewNote: read(at.reviewNote) || null,
    });
  });
  return { rows, issues };
}

/** The message as it goes out: the campaign's footer closes every one of them. */
export function renderBody(body: string, footer: string): string {
  const end = footer.trim();
  const text = body.trim();
  if (!end || text.includes(end)) return text;
  return `${text}\n\n${end}`;
}

/** Left-over template fields: "[adresse postale]", "{{prenom}}". */
export function findPlaceholder(text: string): string | null {
  return text.match(/\[[^\]\n]{1,60}\]|\{\{[^}\n]{1,60}\}\}/)?.[0] ?? null;
}

const POSTAL_CODE_RE =
  /\b[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z][ -]?\d[ABCEGHJ-NPRSTV-Z]\d\b/i;
const FOOTER_OPT_OUT_RE =
  /non merci|d[ée]sabonn|d[ée]sinscri|unsubscribe|ne plus recevoir/i;

export type PreflightIssue =
  | { code: "noAccount" }
  | { code: "noRecipients" }
  | { code: "noFooter" }
  | { code: "footerNoOptOut" }
  | { code: "footerNoAddress" }
  | { code: "placeholder"; value: string; who: string }
  | { code: "invalidEmail"; who: string }
  | { code: "emptyMessage"; who: string };

export type PreflightWarning =
  | { code: "footerNoPostalCode" }
  | { code: "noTest" }
  | { code: "flagged"; count: number }
  | { code: "suppressed"; count: number };

interface PreflightInput {
  hasAccount: boolean;
  footer: string;
  testSentAt: Date | string | null;
  recipients: {
    email: string;
    subject: string;
    body: string;
    reviewNote: string | null;
    selected: boolean;
    status: string;
  }[];
  suppressed: Set<string>;
}

/** What must be right before anything leaves, and what deserves a second look. */
export function preflight(input: PreflightInput): {
  errors: PreflightIssue[];
  warnings: PreflightWarning[];
} {
  const errors: PreflightIssue[] = [];
  const warnings: PreflightWarning[] = [];
  const footer = input.footer.trim();

  if (!input.hasAccount) errors.push({ code: "noAccount" });
  if (!footer) {
    errors.push({ code: "noFooter" });
  } else {
    if (!FOOTER_OPT_OUT_RE.test(footer))
      errors.push({ code: "footerNoOptOut" });
    // A mailing address always has a civic number, a P.O. box number or a postal code.
    if (!/\d/.test(footer)) errors.push({ code: "footerNoAddress" });
    else if (!POSTAL_CODE_RE.test(footer))
      warnings.push({ code: "footerNoPostalCode" });
    const left = findPlaceholder(footer);
    if (left) errors.push({ code: "placeholder", value: left, who: "footer" });
  }

  const going = input.recipients.filter(
    (r) => r.selected && (r.status === "pending" || r.status === "queued")
  );
  const live = going.filter(
    (r) => !input.suppressed.has(normalizeEmail(r.email))
  );
  if (live.length === 0) errors.push({ code: "noRecipients" });

  for (const r of live) {
    if (!isValidEmail(r.email))
      errors.push({ code: "invalidEmail", who: r.email });
    if (!r.subject.trim() || !r.body.trim())
      errors.push({ code: "emptyMessage", who: r.email });
    const left = findPlaceholder(`${r.subject}\n${r.body}`);
    if (left) errors.push({ code: "placeholder", value: left, who: r.email });
  }

  const flagged = live.filter((r) => r.reviewNote).length;
  if (flagged > 0) warnings.push({ code: "flagged", count: flagged });
  const skipped = going.length - live.length;
  if (skipped > 0) warnings.push({ code: "suppressed", count: skipped });
  if (!input.testSentAt) warnings.push({ code: "noTest" });

  return { errors, warnings };
}

export interface SendWindow {
  sendFromHour: number;
  sendUntilHour: number;
  weekdaysOnly: boolean;
}

export function inSendWindow(now: Date, window: SendWindow): boolean {
  const weekday = Number(formatInTimeZone(now, CAMPAIGN_TZ, "i")); // 1 = Monday
  const hour = Number(formatInTimeZone(now, CAMPAIGN_TZ, "H"));
  if (window.weekdaysOnly && weekday > 5) return false;
  return hour >= window.sendFromHour && hour < window.sendUntilHour;
}

/** Midnight in Québec, for the per-day limit. */
export function startOfSendDay(now: Date): Date {
  const day = formatInTimeZone(now, CAMPAIGN_TZ, "yyyy-MM-dd");
  return fromZonedTime(`${day}T00:00:00`, CAMPAIGN_TZ);
}

export type SmtpFailure =
  | "auth"
  | "blocked"
  | "badAddress"
  | "rejected"
  | "transient";

// The provider is acting against the account: checked first, because its codes can look
// like an address problem (Zoho's "554 5.1.8 Email Outgoing Blocked").
const ACCOUNT_BLOCKED_RE =
  /outgoing|unusual|suspicious|too many|rate.?limit|quota|throttl|daily.*limit|limit.*(exceed|reach)|5\.4\.6/i;
const BAD_ADDRESS_RE =
  /(user|mailbox|recipient|address|account)\b.*\b(unknown|not found|does ?n[o']t exist|invalid|disabled|no such)|no such (user|mailbox|recipient)|5\.1\.(1|2|3|10)\b/i;
const POLICY_RE = /block|spam|reputation|policy|5\.7\.\d/i;

/**
 * What a send error means decides what happens next. A bad address costs one
 * recipient and goes on the exclusion list. Being blocked or refused stops the
 * whole campaign, and the recipient stays in line.
 */
export function classifySmtpError(error: unknown): SmtpFailure {
  const e = (error ?? {}) as {
    code?: string;
    responseCode?: number;
    response?: string;
    message?: string;
  };
  const code = e.responseCode ?? 0;
  const text = `${e.response ?? ""} ${e.message ?? ""}`;
  if (e.code === "EAUTH" || code === 535 || code === 534) return "auth";
  if (code >= 400 && ACCOUNT_BLOCKED_RE.test(text)) return "blocked";
  if (BAD_ADDRESS_RE.test(text)) return "badAddress";
  if (code >= 400 && POLICY_RE.test(text)) return "blocked";
  if (code >= 500 || e.code === "EENVELOPE") return "rejected";
  return "transient";
}

const QUOTE_START_RE =
  /^\s*(>|le\s.+\sa\s[ée]crit\s*:|on\s.+\swrote\s*:|-{2,}\s*(original|message|forwarded)|_{5,}|de\s*:\s|from\s*:\s|envoy[ée]\s*:\s|sent\s*:\s)/i;

/** Only what the person wrote: every reply quotes our footer, "non merci" included. */
export function newTextOf(text: string): string {
  const lines: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (QUOTE_START_RE.test(line)) break;
    lines.push(line);
  }
  return lines.join("\n").trim();
}

const OPT_OUT_RE =
  /\bnon,?\s+merci\b|d[ée]sabonn|d[ée]sinscri|unsubscribe|remove me|retire[zr]?[- ](moi|nous)|enlev[ez]+[- ](moi|nous)|ne\s+(m['’]|nous\s+)?([ée]crivez|envoyez|contactez)\s+plus|ne plus (recevoir|[êe]tre contact)|^\s*stop\b/i;
const AUTO_SUBJECT_RE =
  /^\s*(r[ée]ponse automatique|automatic reply|auto(matic)?[- ]?(reply|response)|out of (the )?office|absence|absent|auto\s*:)/i;

export type ReplyKind = "auto" | "unsubscribe" | "reply";

export function classifyReply(input: {
  subject: string;
  text: string;
  headers: Record<string, string>;
}): ReplyKind {
  const header = (name: string) => input.headers[name]?.toLowerCase() ?? "";
  const auto = header("auto-submitted");
  if (
    (auto && !auto.includes(": no")) ||
    input.headers["x-autoreply"] ||
    input.headers["x-autorespond"] ||
    header("precedence").includes("auto_reply") ||
    AUTO_SUBJECT_RE.test(input.subject)
  ) {
    return "auto";
  }
  return OPT_OUT_RE.test(newTextOf(input.text)) ? "unsubscribe" : "reply";
}

const BOUNCE_FROM_RE = /mailer-daemon|postmaster|mail delivery/i;
const BOUNCE_SUBJECT_RE =
  /undeliver|delivery (status|fail)|returned mail|mail delivery failed|failure notice|non remis|[ée]chec de (la )?(remise|livraison)/i;

/**
 * A "delayed" delivery report is a warning: the provider keeps retrying (e.g.
 * Outlook's 421 "too many connections"). Only a failed report is a bounce.
 */
export function isDelayNotice(subject: string, raw: string): boolean {
  if (/^\s*Action:\s*failed/im.test(raw)) return false;
  return (
    /\(delay\)|delayed|delivery delay|retard/i.test(subject) ||
    /^\s*Action:\s*delayed/im.test(raw)
  );
}

export function looksLikeBounce(from: string, subject: string): boolean {
  return BOUNCE_FROM_RE.test(from) || BOUNCE_SUBJECT_RE.test(subject);
}

/** The address behind a List-Unsubscribe click: an empty message with this subject. */
export function isListUnsubscribe(subject: string): boolean {
  return /^\s*unsubscribe\s*$/i.test(subject);
}

/** Should the campaign stop? A few bounces are normal, a stream of them hurts the domain. */
export function tooManyBounces(bounced: number, sent: number): boolean {
  return bounced >= 3 && bounced / Math.max(sent, 1) >= 0.1;
}
