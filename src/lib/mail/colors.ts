/**
 * Dot colours a mail account can pick (stored as the key on MailAccount.color).
 * Full class names so Tailwind keeps them.
 */
export const MAIL_ACCOUNT_COLORS = {
  sky: "bg-sky-500",
  pink: "bg-pink-500",
  orange: "bg-orange-500",
  emerald: "bg-emerald-500",
  violet: "bg-violet-500",
  amber: "bg-amber-500",
  teal: "bg-teal-500",
  rose: "bg-rose-500",
} as const;

export type MailAccountColor = keyof typeof MAIL_ACCOUNT_COLORS;

export const isMailAccountColor = (v: unknown): v is MailAccountColor =>
  typeof v === "string" && v in MAIL_ACCOUNT_COLORS;
