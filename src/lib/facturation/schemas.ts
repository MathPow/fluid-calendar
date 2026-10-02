import { z } from "zod";

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => (v ? v : null));
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide");
const cents = z.number().int().min(-100_000_000_00).max(100_000_000_00);

export const LineInput = z.object({
  description: z.string().trim().max(1000),
  quantity: z.number().min(-1_000_000).max(1_000_000),
  unitCents: cents,
});

const contentFields = {
  organisationId: z.string().min(1),
  contactId: text(60),
  party: z.string().trim().min(1, "Client requis").max(200),
  billTo: text(1000),
  clientEmail: text(200),
  title: text(300),
  lines: z.array(LineInput).min(1, "Au moins une ligne").max(100),
  applyTaxes: z.boolean(),
  lang: z.enum(["fr", "en"]),
  notes: text(4000),
};

export const IssueInput = z.object({
  ...contentFields,
  number: text(100),
  date: day,
  dueDate: day.nullable().optional(),
  status: z.enum(["draft", "sent", "paid"]).optional(),
});
export type IssueInputT = z.infer<typeof IssueInput>;

/** An invoice made elsewhere, added from its PDF (extracted, then reviewed). */
export const ImportInput = z.object({
  organisationId: z.string().min(1),
  contactId: text(60),
  party: z.string().trim().min(1).max(200),
  clientEmail: text(200),
  number: text(100),
  description: text(500),
  date: day,
  dueDate: day.nullable().optional(),
  subtotalCents: cents,
  gstCents: cents,
  qstCents: cents,
  totalCents: cents,
  status: z.enum(["sent", "paid"]),
});

export const InvoicePatch = z.object({
  action: z.enum(["markPaid", "markUnpaid"]),
});

export const SendInput = z.object({
  mailAccountId: z.string().min(1),
  to: z.string().trim().min(3).max(500),
  cc: text(500),
  subject: text(300),
  body: text(10000),
});

export const RecurringInput = z.object({
  ...contentFields,
  title: z.string().trim().min(1, "Nom du contrat requis").max(300),
  cc: text(500),
  frequency: z.enum(["weekly", "monthly", "quarterly", "yearly"]),
  interval: z.number().int().min(1).max(24),
  dueDays: z.number().int().min(0).max(365),
  nextRunDate: day,
  endDate: day.nullable().optional(),
  autoSend: z.boolean(),
  mailAccountId: text(60),
  active: z.boolean().optional(),
});
export type RecurringInputT = z.infer<typeof RecurringInput>;

export const SettingsInput = z.object({
  numberPrefix: text(40),
  dueDays: z.number().int().min(0).max(365),
  lang: z.enum(["fr", "en"]),
  notes: text(4000),
  mailAccountId: text(60),
  emailSubject: text(300),
  emailBody: text(10000),
});
