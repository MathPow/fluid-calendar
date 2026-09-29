import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { invoiceSelect, toInvoiceView } from "@/lib/fiscalite/queries";
import { InvoiceInput } from "@/lib/fiscalite/schemas";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "fiscalite-invoice-api";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** PATCH /api/fiscalite/invoices/[id] — fields only; the file stays. */
export async function PATCH(request: NextRequest, { params }: Ctx) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const { id } = await params;

  const json = await request.json().catch(() => null);
  const parsed = InvoiceInput.partial().safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { date, ...rest } = parsed.data;
  try {
    const row = await prisma.invoice.update({
      where: { id },
      data: { ...rest, ...(date ? { date: new Date(`${date}T00:00:00Z`) } : {}) },
      select: invoiceSelect,
    });
    return NextResponse.json(toInvoiceView(row));
  } catch {
    return NextResponse.json({ error: "Facture introuvable" }, { status: 404 });
  }
}

/** DELETE /api/fiscalite/invoices/[id] — the file goes with it. */
export async function DELETE(request: NextRequest, { params }: Ctx) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const { id } = await params;
  try {
    await prisma.invoice.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Facture introuvable" }, { status: 404 });
  }
}
