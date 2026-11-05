import type { MailCampaign, MailCampaignRecipient } from "@prisma/client";

import { logger } from "@/lib/logger";
import { type LoadedAccount, loadAccount } from "@/lib/mail/account";
import {
  type InboxSignal,
  listInboxSignals,
  saveToSent,
} from "@/lib/mail/imap";
import { sendMail } from "@/lib/mail/smtp";
import { notify } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";

import {
  MAX_ATTEMPTS,
  MAX_CONSECUTIVE_FAILURES,
  RETRY_DELAY_MS,
  STALE_SENDING_MS,
  classifyReply,
  classifySmtpError,
  inSendWindow,
  isListUnsubscribe,
  looksLikeBounce,
  newTextOf,
  normalizeEmail,
  parseCampaignCsv,
  preflight,
  renderBody,
  startOfSendDay,
  tooManyBounces,
} from "./logic";

const LOG_SOURCE = "envois";

/** Give a server that files its own copy time to do it, like the mail composer does. */
const SENT_COPY_DELAY_MS = 4000;

export class CampaignError extends Error {
  constructor(
    message: string,
    readonly status = 400,
    readonly details?: unknown
  ) {
    super(message);
  }
}

async function ownedCampaign(userId: string, id: string) {
  const campaign = await prisma.mailCampaign.findFirst({
    where: { id, userId },
  });
  if (!campaign) throw new CampaignError("Campaign not found", 404);
  return campaign;
}

async function suppressedSet(userId: string) {
  const rows = await prisma.mailSuppression.findMany({
    where: { userId },
    select: { email: true },
  });
  return new Set(rows.map((r) => r.email));
}

async function suppress(
  userId: string,
  email: string,
  reason: string,
  source: string
) {
  const address = normalizeEmail(email);
  await prisma.mailSuppression.upsert({
    where: { userId_email: { userId, email: address } },
    update: {},
    create: { userId, email: address, reason, source },
  });
  // Nobody on this address still waiting in another campaign.
  await prisma.mailCampaignRecipient.updateMany({
    where: {
      email: address,
      status: { in: ["pending", "queued"] },
      campaign: { userId },
    },
    data: { status: "skipped", error: reason },
  });
}

export async function listCampaigns(userId: string) {
  const campaigns = await prisma.mailCampaign.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: { account: { select: { email: true } } },
  });
  const counts = await prisma.mailCampaignRecipient.groupBy({
    by: ["campaignId", "status", "outcome"],
    where: { campaignId: { in: campaigns.map((c) => c.id) } },
    _count: true,
  });
  return campaigns.map((c) => ({
    ...c,
    stats: summarize(counts.filter((row) => row.campaignId === c.id)),
  }));
}

function summarize(
  rows: { status: string; outcome: string | null; _count: number }[]
) {
  const stats = {
    total: 0,
    queued: 0,
    sent: 0,
    failed: 0,
    replied: 0,
    unsubscribed: 0,
    bounced: 0,
  };
  for (const row of rows) {
    stats.total += row._count;
    if (row.status === "queued" || row.status === "sending")
      stats.queued += row._count;
    if (row.status === "sent") stats.sent += row._count;
    if (row.status === "failed" || row.status === "unknown")
      stats.failed += row._count;
    if (row.outcome === "replied") stats.replied += row._count;
    if (row.outcome === "unsubscribed") stats.unsubscribed += row._count;
    if (row.outcome === "bounced") stats.bounced += row._count;
  }
  return stats;
}

export async function getCampaign(userId: string, id: string) {
  const campaign = await prisma.mailCampaign.findFirst({
    where: { id, userId },
    include: {
      account: { select: { email: true } },
      recipients: { orderBy: { position: "asc" } },
    },
  });
  if (!campaign) throw new CampaignError("Campaign not found", 404);
  const check = preflight({
    hasAccount: Boolean(campaign.accountId),
    footer: campaign.footer,
    testSentAt: campaign.testSentAt,
    recipients: campaign.recipients,
    suppressed: await suppressedSet(userId),
  });
  return { ...campaign, preflight: check };
}

export async function createCampaign(
  userId: string,
  input: {
    name: string;
    accountId: string;
    fromName?: string;
    footer?: string;
    csv: string;
  }
) {
  const account = await prisma.mailAccount.findFirst({
    where: { id: input.accountId, userId },
    select: { id: true },
  });
  if (!account) throw new CampaignError("Account not found", 404);

  const { rows, issues } = parseCampaignCsv(input.csv);
  if (rows.length === 0)
    throw new CampaignError("No usable rows", 400, { issues });

  const [suppressed, contacted] = await Promise.all([
    suppressedSet(userId),
    prisma.mailCampaignRecipient.findMany({
      where: {
        campaign: { userId },
        status: "sent",
        email: { in: rows.map((r) => r.email) },
      },
      select: { email: true, sentAt: true },
    }),
  ]);
  const contactedOn = new Map(contacted.map((c) => [c.email, c.sentAt]));

  const campaign = await prisma.mailCampaign.create({
    data: {
      userId,
      accountId: account.id,
      name: input.name.trim(),
      fromName: input.fromName?.trim() || null,
      footer: input.footer?.trim() ?? "",
      recipients: {
        create: rows.map((row, position) => {
          const sentOn = contactedOn.get(row.email);
          const notes = [
            row.reviewNote,
            sentOn
              ? `déjà contacté le ${sentOn.toISOString().slice(0, 10)}`
              : null,
            suppressed.has(row.email) ? "sur la liste d'exclusion" : null,
          ].filter(Boolean);
          const reviewNote = notes.join(" | ") || null;
          // Anything flagged waits for an explicit yes.
          return { ...row, position, reviewNote, selected: !reviewNote };
        }),
      },
    },
  });
  return { id: campaign.id, imported: rows.length, issues };
}

export interface CampaignPatch {
  name?: string;
  fromName?: string | null;
  footer?: string;
  dailyLimit?: number;
  sendFromHour?: number;
  sendUntilHour?: number;
  weekdaysOnly?: boolean;
}

export async function updateCampaign(
  userId: string,
  id: string,
  patch: CampaignPatch
) {
  const campaign = await ownedCampaign(userId, id);
  if (patch.footer !== undefined && campaign.status === "sending") {
    throw new CampaignError(
      "Pause the campaign before changing its footer",
      409
    );
  }
  await prisma.mailCampaign.update({ where: { id }, data: patch });
}

export async function deleteCampaign(userId: string, id: string) {
  await ownedCampaign(userId, id);
  // The history of what was sent is what prevents contacting someone twice.
  const sent = await prisma.mailCampaignRecipient.count({
    where: { campaignId: id, status: "sent" },
  });
  if (sent > 0)
    throw new CampaignError("A campaign that sent messages is kept", 409);
  await prisma.mailCampaign.delete({ where: { id } });
}

/** Tick or untick every message still waiting, or only the flagged ones. */
export async function selectRecipients(
  userId: string,
  id: string,
  selected: boolean,
  onlyFlagged = false
) {
  await ownedCampaign(userId, id);
  await prisma.mailCampaignRecipient.updateMany({
    where: {
      campaignId: id,
      status: "pending",
      ...(onlyFlagged ? { reviewNote: { not: null } } : {}),
    },
    data: { selected },
  });
}

export interface RecipientPatch {
  email?: string;
  subject?: string;
  body?: string;
  selected?: boolean;
  /** Clear the review note: someone looked at it. */
  reviewed?: boolean;
  /** Send a failed or interrupted message again. */
  requeue?: boolean;
}

export async function updateRecipient(
  userId: string,
  campaignId: string,
  recipientId: string,
  patch: RecipientPatch
) {
  const campaign = await ownedCampaign(userId, campaignId);
  const recipient = await prisma.mailCampaignRecipient.findFirst({
    where: { id: recipientId, campaignId },
  });
  if (!recipient) throw new CampaignError("Recipient not found", 404);
  if (recipient.status === "sent" || recipient.status === "sending") {
    throw new CampaignError("This message already left", 409);
  }

  const { requeue, reviewed, ...fields } = patch;
  const data: Partial<MailCampaignRecipient> = { ...fields };
  if (fields.email !== undefined) data.email = normalizeEmail(fields.email);
  if (reviewed) data.reviewNote = null;
  if (requeue) {
    const live = campaign.status === "sending" || campaign.status === "paused";
    Object.assign(data, {
      status: live ? "queued" : "pending",
      selected: true,
      attempts: 0,
      error: null,
      nextAttemptAt: null,
    });
    // A finished campaign has to come back to pick the message up.
    if (campaign.status === "done") {
      await prisma.mailCampaign.update({
        where: { id: campaignId },
        data: { status: "paused", completedAt: null },
      });
      data.status = "queued";
    }
  }
  await prisma.mailCampaignRecipient.update({
    where: { id: recipientId },
    data,
  });
}

/** Queue what's ticked and let the cron send it. Also how a paused campaign resumes. */
export async function startCampaign(userId: string, id: string) {
  const campaign = await ownedCampaign(userId, id);
  if (campaign.status === "sending") return;

  const recipients = await prisma.mailCampaignRecipient.findMany({
    where: { campaignId: id },
  });
  const suppressed = await suppressedSet(userId);
  const check = preflight({
    hasAccount: Boolean(campaign.accountId),
    footer: campaign.footer,
    testSentAt: campaign.testSentAt,
    recipients,
    suppressed,
  });
  if (check.errors.length > 0)
    throw new CampaignError("Not ready to send", 422, check);

  const blocked = recipients
    .filter(
      (r) =>
        suppressed.has(normalizeEmail(r.email)) &&
        ["pending", "queued"].includes(r.status)
    )
    .map((r) => r.id);
  await prisma.$transaction([
    prisma.mailCampaignRecipient.updateMany({
      where: { id: { in: blocked } },
      data: { status: "skipped", error: "suppressed" },
    }),
    prisma.mailCampaignRecipient.updateMany({
      where: { campaignId: id, status: "pending", selected: true },
      data: { status: "queued" },
    }),
    prisma.mailCampaign.update({
      where: { id },
      data: {
        status: "sending",
        pauseReason: null,
        consecutiveFailures: 0,
        startedAt: campaign.startedAt ?? new Date(),
      },
    }),
  ]);
}

export async function pauseCampaign(userId: string, id: string) {
  await ownedCampaign(userId, id);
  await prisma.mailCampaign.updateMany({
    where: { id, status: "sending" },
    data: { status: "paused", pauseReason: null },
  });
}

function fromAccount(account: LoadedAccount, campaign: MailCampaign) {
  return {
    ...account.smtp,
    fromName: campaign.fromName || account.smtp.fromName,
  };
}

/** Exactly what a recipient would get, to the sender's own inbox. Changes no status. */
export async function sendTest(
  userId: string,
  id: string,
  recipientId?: string,
  to?: string
) {
  const campaign = await ownedCampaign(userId, id);
  if (!campaign.accountId) throw new CampaignError("Account not found", 404);
  const account = await loadAccount(userId, campaign.accountId);
  if (!account) throw new CampaignError("Account not found", 404);

  const recipient = await prisma.mailCampaignRecipient.findFirst({
    where: { campaignId: id, ...(recipientId ? { id: recipientId } : {}) },
    orderBy: [{ selected: "desc" }, { position: "asc" }],
  });
  if (!recipient) throw new CampaignError("Recipient not found", 404);

  const target = to?.trim() || account.email;
  await sendMail(fromAccount(account, campaign), {
    to: target,
    subject: `[TEST] ${recipient.subject}`,
    text: renderBody(recipient.body, campaign.footer),
  });
  await prisma.mailCampaign.update({
    where: { id },
    data: { testSentAt: new Date() },
  });
  return { to: target, organisation: recipient.organisation };
}

async function pauseWithReason(
  campaign: MailCampaign,
  reason: string,
  detail: string
) {
  await prisma.mailCampaign.update({
    where: { id: campaign.id },
    data: { status: "paused", pauseReason: reason },
  });
  await notify(campaign.userId, {
    kind: "campaign_paused",
    source: "email",
    important: true,
    title: `Envoi « ${campaign.name} » arrêté`,
    body: detail,
    url: `/envois?campagne=${campaign.id}`,
    dedupeKey: `campaign-paused:${campaign.id}:${reason}:${new Date().toISOString().slice(0, 13)}`,
  });
  logger.warn(
    "Campaign paused",
    { campaignId: campaign.id, reason, detail },
    LOG_SOURCE
  );
}

async function finishIfEmpty(campaign: MailCampaign) {
  const left = await prisma.mailCampaignRecipient.count({
    where: { campaignId: campaign.id, status: { in: ["queued", "sending"] } },
  });
  if (left > 0) return;
  await prisma.mailCampaign.update({
    where: { id: campaign.id },
    data: { status: "done", completedAt: new Date() },
  });
  await notify(campaign.userId, {
    kind: "campaign_done",
    source: "email",
    important: true,
    title: `Envoi « ${campaign.name} » terminé`,
    url: `/envois?campagne=${campaign.id}`,
    dedupeKey: `campaign-done:${campaign.id}:${new Date().toISOString().slice(0, 13)}`,
  });
}

/** Send the next message of a campaign. Returns the address it went to, if any. */
async function sendNext(
  campaign: MailCampaign,
  account: LoadedAccount,
  now: Date
): Promise<string | null> {
  const suppressed = await suppressedSet(campaign.userId);

  // Skip through excluded addresses until one message is really up.
  for (let guard = 0; guard < 500; guard++) {
    const next = await prisma.mailCampaignRecipient.findFirst({
      where: {
        campaignId: campaign.id,
        status: "queued",
        OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
      },
      orderBy: { position: "asc" },
    });
    if (!next) {
      await finishIfEmpty(campaign);
      return null;
    }
    if (suppressed.has(normalizeEmail(next.email))) {
      await prisma.mailCampaignRecipient.update({
        where: { id: next.id },
        data: { status: "skipped", error: "suppressed" },
      });
      continue;
    }

    // Two overlapping runs can't both claim it: only one update finds it queued.
    const claim = await prisma.mailCampaignRecipient.updateMany({
      where: { id: next.id, status: "queued" },
      data: { status: "sending", attempts: { increment: 1 } },
    });
    if (claim.count === 0) return null;

    try {
      const sent = await sendMail(fromAccount(account, campaign), {
        to: next.email,
        subject: next.subject,
        text: renderBody(next.body, campaign.footer),
        headers: {
          "List-Unsubscribe": `<mailto:${account.email}?subject=unsubscribe>`,
        },
      });
      await prisma.mailCampaignRecipient.update({
        where: { id: next.id },
        data: {
          status: "sent",
          sentAt: new Date(),
          messageId: sent.messageId,
          error: null,
          nextAttemptAt: null,
        },
      });
      await prisma.mailCampaign.update({
        where: { id: campaign.id },
        data: { consecutiveFailures: 0 },
      });
      await new Promise((resolve) => setTimeout(resolve, SENT_COPY_DELAY_MS));
      await saveToSent(account.imap, sent.raw, sent.messageId).catch((error) =>
        logger.error(
          "Failed to file campaign mail",
          {
            campaignId: campaign.id,
            error: error instanceof Error ? error.message : String(error),
          },
          LOG_SOURCE
        )
      );
      await finishIfEmpty(campaign);
      return next.email;
    } catch (error) {
      await handleSendFailure(campaign, next, error, now);
      return null;
    }
  }
  return null;
}

async function handleSendFailure(
  campaign: MailCampaign,
  recipient: MailCampaignRecipient,
  error: unknown,
  now: Date
) {
  const kind = classifySmtpError(error);
  const message = (
    error instanceof Error ? error.message : String(error)
  ).slice(0, 500);
  const attempts = recipient.attempts + 1;
  const requeue = {
    status: "queued",
    attempts: recipient.attempts,
    error: message,
  };

  if (kind === "auth" || kind === "blocked") {
    // Not this recipient's fault: it stays in line, and the campaign stops at once.
    await prisma.mailCampaignRecipient.update({
      where: { id: recipient.id },
      data: requeue,
    });
    await pauseWithReason(
      campaign,
      kind,
      kind === "auth"
        ? "Le serveur a refusé le compte. Vérifie le mot de passe d'application dans Réglages."
        : `Le fournisseur bloque ou limite les envois : ${message}`
    );
    return;
  }

  const failures = campaign.consecutiveFailures + 1;
  await prisma.mailCampaign.update({
    where: { id: campaign.id },
    data: { consecutiveFailures: failures },
  });

  if (kind === "transient" && attempts < MAX_ATTEMPTS) {
    await prisma.mailCampaignRecipient.update({
      where: { id: recipient.id },
      data: {
        status: "queued",
        error: message,
        nextAttemptAt: new Date(now.getTime() + RETRY_DELAY_MS),
      },
    });
  } else {
    await prisma.mailCampaignRecipient.update({
      where: { id: recipient.id },
      data: { status: "failed", error: message, nextAttemptAt: null },
    });
    if (kind === "badAddress")
      await suppress(campaign.userId, recipient.email, "bounced", campaign.id);
  }

  if (failures >= MAX_CONSECUTIVE_FAILURES) {
    await pauseWithReason(
      campaign,
      "failures",
      `${failures} échecs de suite. Dernière erreur : ${message}`
    );
    return;
  }
  await finishIfEmpty(campaign);
}

interface SentIndex {
  byMessageId: Map<string, MailCampaignRecipient & { campaign: MailCampaign }>;
  byEmail: Map<string, MailCampaignRecipient & { campaign: MailCampaign }>;
}

async function applySignal(signal: InboxSignal, index: SentIndex) {
  const from = signal.from[0]?.address ?? "";
  const when = signal.date ? new Date(signal.date) : new Date();

  if (looksLikeBounce(from, signal.subject)) {
    // A bounce quotes the original Message-ID. An address alone proves nothing: skip without it.
    const recipient = [...index.byMessageId.entries()].find(([id]) =>
      signal.raw.includes(id)
    )?.[1];
    if (!recipient || recipient.outcome === "bounced") return;
    await prisma.mailCampaignRecipient.update({
      where: { id: recipient.id },
      data: {
        outcome: "bounced",
        outcomeAt: when,
        replySnippet: signal.subject.slice(0, 300),
      },
    });
    await suppress(
      recipient.campaign.userId,
      recipient.email,
      "bounced",
      recipient.campaignId
    );
    recipient.outcome = "bounced";
    const counts = await prisma.mailCampaignRecipient.groupBy({
      by: ["outcome"],
      where: { campaignId: recipient.campaignId, status: "sent" },
      _count: true,
    });
    const sent = counts.reduce((n, row) => n + row._count, 0);
    const bounced =
      counts.find((row) => row.outcome === "bounced")?._count ?? 0;
    const campaign = await prisma.mailCampaign.findUnique({
      where: { id: recipient.campaignId },
    });
    if (campaign?.status === "sending" && tooManyBounces(bounced, sent)) {
      await pauseWithReason(
        campaign,
        "bounces",
        `${bounced} rebonds sur ${sent} messages envoyés.`
      );
    }
    return;
  }

  // The empty message behind a mail client's "Unsubscribe" button.
  if (isListUnsubscribe(signal.subject) && signal.parents.length === 0) {
    const recipient = index.byEmail.get(normalizeEmail(from));
    if (!recipient) return;
    await markUnsubscribed(recipient, from, when, "List-Unsubscribe");
    return;
  }

  const parent = signal.parents.find((id) => index.byMessageId.has(id));
  const recipient = parent ? index.byMessageId.get(parent) : undefined;
  if (!recipient) return;

  const kind = classifyReply(signal);
  if (kind === "auto") return;
  if (kind === "unsubscribe") {
    await markUnsubscribed(recipient, from, when, newTextOf(signal.text));
    return;
  }
  if (recipient.outcome) return; // the first answer tells the story
  await prisma.mailCampaignRecipient.update({
    where: { id: recipient.id },
    data: {
      outcome: "replied",
      outcomeAt: when,
      replySnippet: newTextOf(signal.text).slice(0, 300),
    },
  });
  recipient.outcome = "replied";
}

async function markUnsubscribed(
  recipient: MailCampaignRecipient & { campaign: MailCampaign },
  from: string,
  when: Date,
  snippet: string
) {
  await prisma.mailCampaignRecipient.update({
    where: { id: recipient.id },
    data: {
      outcome: "unsubscribed",
      outcomeAt: when,
      replySnippet: snippet.slice(0, 300),
    },
  });
  recipient.outcome = "unsubscribed";
  await suppress(
    recipient.campaign.userId,
    recipient.email,
    "unsubscribed",
    recipient.campaignId
  );
  // Someone else at the organisation may have answered for that address.
  if (from && normalizeEmail(from) !== recipient.email) {
    await suppress(
      recipient.campaign.userId,
      from,
      "unsubscribed",
      recipient.campaignId
    );
  }
  await notify(recipient.campaign.userId, {
    kind: "campaign_unsubscribe",
    source: "email",
    title: `${recipient.organisation ?? recipient.email} ne veut plus de courriels`,
    body: `${recipient.email} est maintenant sur la liste d'exclusion.`,
    url: `/envois?campagne=${recipient.campaignId}`,
    dedupeKey: `campaign-unsub:${recipient.id}`,
  });
}

/** Read new mail on an account for replies, opt-outs and bounces to its campaigns. */
async function scanAccount(userId: string, accountId: string) {
  const account = await loadAccount(userId, accountId);
  if (!account) return;

  const stored = await prisma.mailAccount.findUnique({
    where: { id: accountId },
    select: { campaignScanUid: true },
  });
  const sent = await prisma.mailCampaignRecipient.findMany({
    where: {
      status: "sent",
      messageId: { not: null },
      campaign: { accountId },
    },
    include: { campaign: true },
  });
  if (sent.length === 0) return;

  const index: SentIndex = { byMessageId: new Map(), byEmail: new Map() };
  for (const r of sent) {
    index.byMessageId.set(r.messageId!, r);
    index.byEmail.set(r.email, r);
  }

  const { signals, maxUid } = await listInboxSignals(
    account.imap,
    stored?.campaignScanUid ?? 0,
    (envelope) => {
      const from = envelope.from[0]?.address ?? "";
      return (
        envelope.parents.some((id) => index.byMessageId.has(id)) ||
        looksLikeBounce(from, envelope.subject) ||
        isListUnsubscribe(envelope.subject)
      );
    }
  );
  for (const signal of signals) await applySignal(signal, index);
  await prisma.mailAccount.update({
    where: { id: accountId },
    data: { campaignScanUid: maxUid },
  });
}

/**
 * One run of the 5-minute cron: first read what came back, so an opt-out counts
 * before the next message, then send at most one message per mail account.
 */
export async function runCampaignTick(now = new Date()) {
  // Cut off mid-send, a message may or may not have left. Sending it again could
  // double it, so it waits for a human.
  await prisma.mailCampaignRecipient.updateMany({
    where: {
      status: "sending",
      updatedAt: { lt: new Date(now.getTime() - STALE_SENDING_MS) },
    },
    data: {
      status: "unknown",
      error:
        "Envoi interrompu : vérifie dans les messages envoyés avant de relancer.",
    },
  });

  const accounts = await prisma.mailCampaign.findMany({
    where: {
      accountId: { not: null },
      recipients: { some: { status: "sent" } },
    },
    select: { userId: true, accountId: true },
    distinct: ["accountId"],
  });
  for (const { userId, accountId } of accounts) {
    await scanAccount(userId, accountId!).catch((error) =>
      logger.warn(
        "Campaign inbox scan failed",
        {
          accountId,
          error: error instanceof Error ? error.message : String(error),
        },
        LOG_SOURCE
      )
    );
  }

  const sending = await prisma.mailCampaign.findMany({
    where: { status: "sending" },
    orderBy: { startedAt: "asc" },
  });

  const sent: string[] = [];
  const usedAccounts = new Set<string>();
  for (const campaign of sending) {
    if (!campaign.accountId) {
      await pauseWithReason(
        campaign,
        "noAccount",
        "Le compte de courriel de cet envoi a été retiré."
      );
      continue;
    }
    if (usedAccounts.has(campaign.accountId)) continue;
    if (!inSendWindow(now, campaign)) continue;

    const today = await prisma.mailCampaignRecipient.count({
      where: {
        sentAt: { gte: startOfSendDay(now) },
        campaign: { accountId: campaign.accountId },
      },
    });
    if (today >= campaign.dailyLimit) continue;

    const account = await loadAccount(campaign.userId, campaign.accountId);
    if (!account) {
      await pauseWithReason(
        campaign,
        "noAccount",
        "Le compte de courriel de cet envoi a été retiré."
      );
      continue;
    }

    usedAccounts.add(campaign.accountId);
    const address = await sendNext(campaign, account, now);
    if (address) sent.push(address);
  }
  return { sent };
}

export async function listSuppressions(userId: string) {
  return prisma.mailSuppression.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
}

export async function addSuppression(userId: string, email: string) {
  await suppress(userId, email, "manual", "manual");
}

export async function removeSuppression(userId: string, id: string) {
  await prisma.mailSuppression.deleteMany({ where: { id, userId } });
}
