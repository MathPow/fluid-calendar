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
});
export type InvoiceInputT = z.infer<typeof InvoiceInput>;

export const TaxProfileInput = z.object({
  legalForm: z.enum(["individuelle", "societe"]),
  salesTaxStatus: z.enum(["petit", "inscrit"]),
  gstNumber: text(40),
  qstNumber: text(40),
  filingFrequency: z.enum(["annuelle", "trimestrielle", "mensuelle"]),
  fiscalYearEnd: z.string().regex(/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, "Fin d'exercice invalide"),
  notes: text(4000),
});

/** Files accepted in the drop zone. */
export const INVOICE_MIMES = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic"];
export const MAX_INVOICE_BYTES = 15 * 1024 * 1024;
