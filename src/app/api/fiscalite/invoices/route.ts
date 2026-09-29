import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { pdfText } from "@/lib/fiscalite/extract";
import { invoiceSelect, toInvoiceView } from "@/lib/fiscalite/queries";
import { INVOICE_MIMES, InvoiceInput, MAX_INVOICE_BYTES } from "@/lib/fiscalite/schemas";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "fiscalite-invoices-api";

export const dynamic = "force-dynamic";

/** GET /api/fiscalite/invoices?organisationId= — newest first, no file bytes. */
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const organisationId = request.nextUrl.searchParams.get("organisationId") ?? undefined;
  const rows = await prisma.invoice.findMany({
    where: { organisationId },
    select: invoiceSelect,
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });
  return NextResponse.json(rows.map(toInvoiceView));
}

/**
 * POST /api/fiscalite/invoices — multipart: `data` (JSON, InvoiceInput) and
 * an optional `file` (the invoice itself), or a plain JSON body.
 */
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;

  let json: unknown;
  let file: File | null = null;
  try {
    if (request.headers.get("content-type")?.includes("multipart/form-data")) {
      const form = await request.formData();
      json = JSON.parse(String(form.get("data") ?? "{}"));
      const f = form.get("file");
      if (f instanceof File && f.size > 0) file = f;
    } else {
      json = await request.json();
    }
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const parsed = InvoiceInput.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  if (file && file.size > MAX_INVOICE_BYTES) {
    return NextResponse.json({ error: "Fichier trop lourd (15 Mo max)" }, { status: 413 });
  }
  if (file && !INVOICE_MIMES.includes(file.type)) {
    return NextResponse.json({ error: "PDF ou image seulement" }, { status: 415 });
  }

  const { date, ...rest } = parsed.data;
  try {
    const bytes = file ? new Uint8Array(await file.arrayBuffer()) : null;
    const text = bytes && file?.type === "application/pdf" ? await pdfText(bytes) : null;
    const row = await prisma.invoice.create({
      data: {
        ...rest,
        date: new Date(`${date}T00:00:00Z`),
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
      select: invoiceSelect,
    });
    return NextResponse.json(toInvoiceView(row), { status: 201 });
  } catch (error) {
    logger.error(
      "Failed to create invoice",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json({ error: "Enregistrement impossible" }, { status: 500 });
  }
}
