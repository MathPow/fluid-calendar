import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { contactInclude } from "@/lib/projets/queries";
import { ContactInput } from "@/lib/projets/schemas";

const LOG_SOURCE = "contacts-api";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** PATCH /api/contacts/[id] — `projectIds`, when present, replaces the set. */
export async function PATCH(request: NextRequest, { params }: Ctx) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const { id } = await params;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = ContactInput.partial().safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { projectIds, ...fields } = parsed.data;

  try {
    const contact = await prisma.$transaction(async (tx) => {
      await tx.contact.update({
        where: { id },
        data: {
          ...(fields.name !== undefined ? { name: fields.name } : {}),
          ...(fields.email !== undefined ? { email: fields.email || null } : {}),
          ...(fields.phone !== undefined ? { phone: fields.phone || null } : {}),
          ...(fields.company !== undefined ? { company: fields.company || null } : {}),
          ...(fields.role !== undefined ? { role: fields.role || null } : {}),
          ...(fields.notes !== undefined ? { notes: fields.notes || null } : {}),
        },
      });
      if (projectIds !== undefined) {
        await tx.projectContact.deleteMany({ where: { contactId: id } });
        if (projectIds.length) {
          await tx.projectContact.createMany({
            data: projectIds.map((projectId) => ({ projectId, contactId: id })),
            skipDuplicates: true,
          });
        }
      }
      return tx.contact.findUniqueOrThrow({ where: { id }, include: contactInclude });
    });
    return NextResponse.json(contact);
  } catch (error) {
    logger.error(
      "Failed to update contact",
      { id, error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json({ error: "Mise à jour impossible" }, { status: 500 });
  }
}

/** DELETE /api/contacts/[id] */
export async function DELETE(request: NextRequest, { params }: Ctx) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const { id } = await params;
  try {
    await prisma.contact.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    logger.error(
      "Failed to delete contact",
      { id, error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json({ error: "Suppression impossible" }, { status: 500 });
  }
}
