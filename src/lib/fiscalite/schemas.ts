import { z } from "zod";

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => (v ? v : null));
const cents = z.number().int().min(-100_000_000_00).max(100_000_000_00);

export const InvoiceInput = z.object({
  organisationId: z.string().min(1),
  direction: z.enum(["depense", "revenu"]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide"),
  party: text(200),
  partyTaxNumber: text(100),
  number: text(100),
  description: text(500),
  category: text(50),
  subtotalCents: cents,
  gstCents: cents,
  qstCents: cents,
  totalCents: cents,
  notes: text(4000),
  paidBy: text(80),
});
export type InvoiceInputT = z.infer<typeof InvoiceInput>;

export const TaxProfileInput = z.object({
  legalForm: z.enum(["individuelle", "senc", "societe", "personnel"]),
  partners: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
  partnerShares: z.array(z.number().min(0).max(100)).max(20).default([]),
  partnerContactIds: z.array(z.string().max(60)).max(20).default([]),
  startedAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional()
    .transform((v) => (v ? new Date(`${v}T00:00:00Z`) : null)),
  legalName: text(200),
  neq: text(20),
  businessNumber: text(20),
  rqNumber: text(30),
  payrollNumber: text(30),
  activity: text(500),
  naicsCode: text(10),
  address: text(200),
  city: text(100),
  province: z.string().trim().max(10).default("QC"),
  postalCode: text(10),
  email: text(200),
  phone: text(40),
  website: text(200),
  bank: text(200),
  accountant: text(200),
  accountantEmail: text(200),
  accountantPhone: text(40),
  salesTaxStatus: z.enum(["petit", "inscrit"]),
  gstNumber: text(40),
  qstNumber: text(40),
  filingFrequency: z.enum(["annuelle", "trimestrielle", "mensuelle"]),
  fiscalYearEnd: z
    .string()
    .regex(
      /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/,
      "Fin d'exercice invalide"
    ),
  notes: text(4000),
});

/** Files accepted in the drop zone. */
export const INVOICE_MIMES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
];
export const MAX_INVOICE_BYTES = 15 * 1024 * 1024;

export const MovementInput = z.object({
  organisationId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide"),
  kind: z.enum(["avance", "remboursement", "retrait"]),
  partner: z.string().trim().min(1).max(80),
  amountCents: cents.refine((v) => v > 0, "Montant positif"),
  account: text(100),
  notes: text(2000),
});

export const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
