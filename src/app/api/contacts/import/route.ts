import { NextRequest, NextResponse } from "next/server";

import { getT } from "@/i18n/server";
import { z } from "zod";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { ContactInput } from "@/lib/projets/schemas";

const LOG_SOURCE = "contacts-import-api";

export const dynamic = "force-dynamic";

const Dismissal = z.object({
  key: z.string().trim().min(1).max(300),
  name: z.string().trim().min(1).max(200),
});

const ImportBody = z.object({
  /** The people kept. */
  create: z.array(ContactInput).max(5000).default([]),
  /** The people left out, so the next import skips them. */
  dismiss: z.array(Dismissal).max(20000).default([]),
});

/** GET /api/contacts/import — keys of the people left out by earlier imports. */
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const rows = await prisma.contactImportDismissal.findMany({
    select: { key: true },
  });
  return NextResponse.json({ dismissed: rows.map((r) => r.key) });
}

/**
 * POST /api/contacts/import — adds the contacts picked from a social export
 * and remembers the ones left out.
 */
export async function POST(request: NextRequest) {
  const t = await getT();
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = ImportBody.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { create, dismiss } = parsed.data;

  try {
    await prisma.$transaction([
      ...create.map((c) =>
        prisma.contact.create({
          data: {
            type: c.type ?? "person",
            name: c.name,
            email: c.email || null,
            company: c.company || null,
            role: c.role || null,
            relation: c.relation || null,
            tags: c.tags ?? [],
            notes: c.notes || null,
            links: {
              create: (c.links ?? []).map((l, i) => ({ ...l, sortOrder: i })),
            },
          },
        })
      ),
      prisma.contactImportDismissal.createMany({
        data: dismiss,
        skipDuplicates: true,
      }),
    ]);
    return NextResponse.json({
      created: create.length,
      dismissed: dismiss.length,
    });
  } catch (error) {
    logger.error(
      "Failed to import contacts",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json({ error: t("api.contacts.importFailed") }, { status: 500 });
  }
}

/** DELETE /api/contacts/import — forget every left-out person (offer them again). */
export async function DELETE(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const { count } = await prisma.contactImportDismissal.deleteMany({});
  return NextResponse.json({ cleared: count });
}
