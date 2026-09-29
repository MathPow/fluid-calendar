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

  const json = (await request.json().catch(() => null)) as { tracked?: unknown } | null;
  if (typeof json?.tracked !== "boolean") {
    return NextResponse.json({ error: "`tracked` (boolean) attendu" }, { status: 400 });
  }
  const org = await prisma.organisation.findUnique({ where: { id: organisationId } });
  if (!org) return NextResponse.json({ error: "Organisation introuvable" }, { status: 404 });

  const profile = await prisma.taxProfile.upsert({
    where: { organisationId },
    create: { organisationId, tracked: json.tracked, setUp: false },
    update: { tracked: json.tracked },
  });
  return NextResponse.json(profile);
}
