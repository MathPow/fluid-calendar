import { prisma } from "@/lib/prisma";
import { sendPushToUser } from "@/lib/push-notifications";

export type NotifyInput = {
  kind: string;
  title: string;
  body?: string | null;
  url?: string | null;
  source?: string | null;
  /** Important news also goes to the phone as a push notification. */
  important?: boolean;
  /** Same key = same news; a repeat is ignored. */
  dedupeKey?: string | null;
  /** Record it but don't push (e.g. old news found on a first scan). */
  silent?: boolean;
  createdAt?: Date;
};

/**
 * Record a notification for a user and, when important, push it to their
 * devices. Returns null when the dedupe key was already recorded.
 */
export async function notify(userId: string, n: NotifyInput) {
  if (n.dedupeKey) {
    const seen = await prisma.notification.findUnique({
      where: { userId_dedupeKey: { userId, dedupeKey: n.dedupeKey } },
      select: { id: true },
    });
    if (seen) return null;
  }
  const push = Boolean(n.important && !n.silent);
  const row = await prisma.notification.create({
    data: {
      userId,
      kind: n.kind,
      title: n.title.slice(0, 200),
      body: n.body?.slice(0, 1000) || null,
      url: n.url || null,
      source: n.source || null,
      important: Boolean(n.important),
      dedupeKey: n.dedupeKey || null,
      pushedAt: push ? new Date() : null,
      ...(n.createdAt ? { createdAt: n.createdAt } : {}),
    },
  });
  if (push) {
    try {
      await sendPushToUser(userId, {
        title: row.title,
        body: row.body ?? "",
        url: row.url ?? "/dashboard",
      });
    } catch {
      // The notification is recorded; a failed push shouldn't fail the caller.
    }
  }
  return row;
}

/**
 * The account ingest endpoints act for: this is a single-user app, so the
 * admin (or the first user).
 */
export async function ownerUserId(): Promise<string | null> {
  const user =
    (await prisma.user.findFirst({
      where: { role: "admin" },
      orderBy: { id: "asc" },
    })) ?? (await prisma.user.findFirst({ orderBy: { id: "asc" } }));
  return user?.id ?? null;
}
