import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { extractInvoice } from "@/lib/fiscalite/extract";
import { INVOICE_MIMES, MAX_INVOICE_BYTES } from "@/lib/fiscalite/schemas";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "fiscalite-extract-api";

export const dynamic = "force-dynamic";

/**
 * POST /api/fiscalite/extract — multipart `file` (+ `organisationId`).
 * Reads the invoice and returns suggested fields; saves nothing.
 */
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Fichier manquant" }, { status: 400 });
  }
  if (file.size > MAX_INVOICE_BYTES) {
    return NextResponse.json({ error: "Fichier trop lourd (15 Mo max)" }, { status: 413 });
  }
  if (!INVOICE_MIMES.includes(file.type)) {
    return NextResponse.json({ error: "PDF ou image seulement" }, { status: 415 });
  }

  const orgId = form?.get("organisationId");
  const org =
    typeof orgId === "string"
      ? await prisma.organisation.findUnique({ where: { id: orgId }, select: { name: true } })
      : null;

  const bytes = new Uint8Array(await file.arrayBuffer());
  const { guess, source, text } = await extractInvoice(bytes, file.type, org ? [org.name] : []);
  return NextResponse.json({ guess, source, hasText: text.length > 0 });
}
