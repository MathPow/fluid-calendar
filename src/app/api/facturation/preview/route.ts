import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { computeTotals } from "@/lib/facturation/meta";
import { renderInvoicePdf } from "@/lib/facturation/pdf";
import { IssueInput } from "@/lib/facturation/schemas";
import { issuerFor, nextNumberFor } from "@/lib/facturation/service";

const LOG_SOURCE = "facturation-preview-api";

export const dynamic = "force-dynamic";

/** POST /api/facturation/preview — the PDF an IssueInput would produce; saves nothing. */
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const parsed = IssueInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
  }
  const d = parsed.data;
  const { issuer } = await issuerFor(d.organisationId).catch(() => ({ issuer: null }));
  if (!issuer) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const pdf = await renderInvoicePdf({
    lang: d.lang,
    number: d.number || (await nextNumberFor(d.organisationId)),
    date: d.date,
    dueDate: d.dueDate ?? null,
    issuer,
    client: { name: d.party, billTo: d.billTo, email: d.clientEmail },
    title: d.title,
    lines: d.lines,
    totals: computeTotals(d.lines, d.applyTaxes),
    applyTaxes: d.applyTaxes,
    notes: d.notes,
  });
  return new NextResponse(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Cache-Control": "no-store" },
  });
}
