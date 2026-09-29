import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { TaxProfileInput } from "@/lib/fiscalite/schemas";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "fiscalite-profile-api";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ organisationId: string }> };

/** PUT /api/fiscalite/profiles/[organisationId] — the company's tax setup. */
export async function PUT(request: NextRequest, { params }: Ctx) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const { organisationId } = await params;

  const json = await request.json().catch(() => null);
  const parsed = TaxProfileInput.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const org = await prisma.organisation.findUnique({ where: { id: organisationId } });
  if (!org) return NextResponse.json({ error: "Organisation introuvable" }, { status: 404 });

  const profile = await prisma.taxProfile.upsert({
    where: { organisationId },
    create: { organisationId, ...parsed.data, setUp: true },
    update: { ...parsed.data, setUp: true },
  });
  return NextResponse.json(profile);
}

/** PATCH /api/fiscalite/profiles/[organisationId] — `{ tracked }`: show it in the tab or not. */
export async function PATCH(request: NextRequest, { params }: Ctx) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const { organisationId } = await params;

  const json = (await request.json().catch(() => null)) as { tracked?: unknown; budgets?: unknown } | null;
  const tracked = typeof json?.tracked === "boolean" ? json.tracked : undefined;
  // Budget perso: { categoryId: monthly cents }.
  let budgets: Record<string, number> | undefined;
  if (json?.budgets !== undefined) {
    const b = json.budgets;
    if (
      !b ||
      typeof b !== "object" ||
      Array.isArray(b) ||
      Object.keys(b).length > 100 ||
      !Object.entries(b).every(([k, v]) => k.length <= 60 && Number.isInteger(v) && (v as number) >= 0 && (v as number) < 1e10)
    ) {
      return NextResponse.json({ error: "`budgets` invalide" }, { status: 400 });
    }
    budgets = b as Record<string, number>;
  }
  if (tracked === undefined && budgets === undefined) {
    return NextResponse.json({ error: "`tracked` ou `budgets` attendu" }, { status: 400 });
  }
  const org = await prisma.organisation.findUnique({ where: { id: organisationId } });
  if (!org) return NextResponse.json({ error: "Organisation introuvable" }, { status: 404 });

  const profile = await prisma.taxProfile.upsert({
    where: { organisationId },
    create: {
      organisationId,
      tracked: tracked ?? true,
      setUp: false,
      ...(budgets ? { budgets } : {}),
      // The personal bucket is a budget, not a business.
      ...(budgets || org.kind === "perso" ? { legalForm: "personnel" } : {}),
    },
    update: { ...(tracked !== undefined ? { tracked } : {}), ...(budgets ? { budgets } : {}) },
  });
  return NextResponse.json(profile);
}
