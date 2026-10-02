import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { pdfText } from "@/lib/fiscalite/extract";
import { INVOICE_MIMES, MAX_INVOICE_BYTES } from "@/lib/fiscalite/schemas";
import { ImportInput, IssueInput } from "@/lib/facturation/schemas";
import { issuedSelect, saveIssuedInvoice, toIssuedView } from "@/lib/facturation/service";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "facturation-invoices-api";

export const dynamic = "force-dynamic";

/** GET /api/facturation/invoices?organisationId= — issued (revenu) invoices, newest first. */
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const organisationId = request.nextUrl.searchParams.get("organisationId") ?? undefined;
  const rows = await prisma.invoice.findMany({
    where: { organisationId, direction: "revenu" },
    select: issuedSelect,
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });
  return NextResponse.json(rows.map(toIssuedView));
}

/**
 * POST /api/facturation/invoices
 * - JSON (IssueInput): make an invoice here, PDF generated.
 * - multipart `data` (ImportInput) + `file`: add an invoice made elsewhere.
 */
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;

  if (request.headers.get("content-type")?.includes("multipart/form-data")) {
    return importInvoice(request);
  }
  const parsed = IssueInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const view = await saveIssuedInvoice(parsed.data);
    return NextResponse.json(view, { status: 201 });
  } catch (error) {
    logger.error(
      "Failed to issue invoice",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json({ error: "Enregistrement impossible" }, { status: 500 });
  }
}

async function importInvoice(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  let json: unknown = null;
  try {
    json = JSON.parse(String(form?.get("data") ?? "{}"));
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const parsed = ImportInput.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
  }
  const f = form?.get("file");
  const file = f instanceof File && f.size > 0 ? f : null;
  if (file && file.size > MAX_INVOICE_BYTES) {
    return NextResponse.json({ error: "Fichier trop lourd (15 Mo max)" }, { status: 413 });
  }
  if (file && !INVOICE_MIMES.includes(file.type)) {
    return NextResponse.json({ error: "PDF ou image seulement" }, { status: 415 });
  }

  const { date, dueDate, status, ...rest } = parsed.data;
  try {
    const bytes = file ? new Uint8Array(await file.arrayBuffer()) : null;
    const text = bytes && file?.type === "application/pdf" ? await pdfText(bytes) : null;
    const row = await prisma.invoice.create({
      data: {
        ...rest,
        direction: "revenu",
        category: "services",
        date: new Date(`${date}T00:00:00Z`),
        dueDate: dueDate ? new Date(`${dueDate}T00:00:00Z`) : null,
        status,
        paidAt: status === "paid" ? new Date(`${date}T00:00:00Z`) : null,
        file:
          file && bytes
            ? {
                create: {
                  name: file.name.slice(0, 200) || "facture",
                  mime: file.type,
                  size: file.size,
                  data: Buffer.from(bytes),
                  text: text || null,
                },
              }
            : undefined,
      },
      select: issuedSelect,
    });
    return NextResponse.json(toIssuedView(row), { status: 201 });
  } catch (error) {
    logger.error(
      "Failed to import invoice",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json({ error: "Enregistrement impossible" }, { status: 500 });
  }
}
