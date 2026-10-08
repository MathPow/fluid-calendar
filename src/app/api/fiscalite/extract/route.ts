import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { pickCategory } from "@/lib/fiscalite/category-guess";
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
      ? await prisma.organisation.findUnique({
          where: { id: orgId },
          select: { id: true, name: true, kind: true, taxProfile: { select: { legalForm: true } } },
        })
      : null;
  const personal = org?.kind === "perso" || org?.taxProfile?.legalForm === "personnel";

  const bytes = new Uint8Array(await file.arrayBuffer());
  const { guess, source, text } = await extractInvoice(bytes, file.type, org ? [org.name] : [], personal);

  // Same supplier (or client) as a past invoice of this company → same category.
  const direction = guess.direction ?? "depense";
  const party = guess.party?.trim();
  const past =
    org && party
      ? await prisma.invoice.findFirst({
          where: {
            organisationId: org.id,
            direction,
            party: { equals: party, mode: "insensitive" },
            category: { not: null },
          },
          orderBy: { date: "desc" },
          select: { category: true },
        })
      : null;
  const picked = pickCategory({
    direction,
    personal,
    history: past?.category,
    party,
    llm: guess.category,
    text,
  });
  guess.category = picked.category;
  guess.categorySource = picked.source;
  return NextResponse.json({ guess, source, hasText: text.length > 0 });
}
