import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { SettingsInput } from "@/lib/facturation/schemas";
import { nextNumberFor, settingsFor } from "@/lib/facturation/service";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "facturation-settings-api";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ organisationId: string }> };

/** GET — the company's invoicing defaults + the next invoice number. */
export async function GET(request: NextRequest, { params }: Ctx) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const { organisationId } = await params;
  const [settings, nextNumber] = await Promise.all([settingsFor(organisationId), nextNumberFor(organisationId)]);
  return NextResponse.json({ ...settings, nextNumber });
}

/** PUT — save the defaults. */
export async function PUT(request: NextRequest, { params }: Ctx) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const { organisationId } = await params;
  const parsed = SettingsInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
  }
  await prisma.invoicingSettings.upsert({
    where: { organisationId },
    create: { organisationId, ...parsed.data },
    update: parsed.data,
  });
  const [settings, nextNumber] = await Promise.all([settingsFor(organisationId), nextNumberFor(organisationId)]);
  return NextResponse.json({ ...settings, nextNumber });
}
