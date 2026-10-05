/**
 * In-app deep links to a single item. Each target page honours its params
 * through `useDeepLink` (see src/hooks/use-deep-link.ts), so these open the
 * item itself rather than just the section it lives in.
 */

/** The user's wall-clock zone — the server runs in UTC. */
export const USER_TZ = process.env.USER_TZ || "America/Toronto";

/** YYYY-MM-DD of `d` in the user's zone. */
export function localDay(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: USER_TZ });
}

export const links = {
  task: (id: string) => `/tasks?task=${encodeURIComponent(id)}`,
  event: (start: Date) => `/calendar?date=${localDay(start)}`,
  note: (path: string) => `/notes?path=${encodeURIComponent(path)}`,
  recording: () => "/notes?tab=recordings",
  email: (accountId: string, mailbox: string, uid: number) =>
    `/email?${new URLSearchParams({
      account: accountId,
      mailbox,
      uid: String(uid),
    })}`,
  contact: (name: string) => `/contacts?q=${encodeURIComponent(name)}`,
  projet: (slug: string) => `/projets/${slug}`,
};
