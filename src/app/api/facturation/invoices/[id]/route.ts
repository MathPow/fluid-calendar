import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { InvoicePatch, IssueInput } from "@/lib/facturation/schemas";
import { issuedSelect, saveIssuedInvoice, toIssuedView } from "@/lib/facturation/service";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "facturation-invoice-api";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * PATCH /api/facturation/invoices/[id]
 * - { action: "markPaid" | "markUnpaid" }
 * - an IssueInput: rewrite an invoice made here (lines, client…) and its PDF.
 */
export async function PATCH(request: NextRequest, { params }: Ctx) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const body = await request.json().catch(() => null);

  const existing = await prisma.invoice.findUnique({
    where: { id },
    select: { id: true, status: true, sentAt: true, lines: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const patch = InvoicePatch.safeParse(body);
  if (patch.success) {
    const paid = patch.data.action === "markPaid";
    const row = await prisma.invoice.update({
      where: { id },
      data: paid
        ? { status: "paid", paidAt: new Date() }
        : { status: existing.sentAt ? "sent" : existing.lines != null ? "draft" : "sent", paidAt: null },
      select: issuedSelect,
    });
    return NextResponse.json(toIssuedView(row));
  }

  const parsed = IssueInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
  }
  if (existing.lines == null) {
    // Imported invoices keep their original file: edit them in Fiscalité.
    return NextResponse.json(
      {
        error: "Facture importée : modifie-la dans Fiscalité",
        errorKey: "api.facturation.importedInvoice",
      },
      { status: 409 }
    );
  }
  try {
    return NextResponse.json(await saveIssuedInvoice(parsed.data, id));
  } catch (error) {
    logger.error(
      "Failed to update invoice",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json({ error: "Enregistrement impossible" }, { status: 500 });
  }
}

/** DELETE /api/facturation/invoices/[id] */
export async function DELETE(request: NextRequest, { params }: Ctx) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const { id } = await params;
  await prisma.invoice.delete({ where: { id } }).catch(() => null);
  return new NextResponse(null, { status: 204 });
}
