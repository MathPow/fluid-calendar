import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { contactInclude } from "@/lib/projets/queries";
import { ContactInput } from "@/lib/projets/schemas";

const LOG_SOURCE = "contacts-api";

export const dynamic = "force-dynamic";

/** GET /api/contacts — all contacts with the projects they're attached to. */
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const contacts = await prisma.contact.findMany({
    include: contactInclude,
    orderBy: { name: "asc" },
  });
  return NextResponse.json(contacts);
}

/** POST /api/contacts — create a contact, optionally attached to projects. */
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = ContactInput.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const {
    projectIds = [],
    tags = [],
    tagIds = [],
    links = [],
    ...fields
  } = parsed.data;

  try {
    const contact = await prisma.contact.create({
      data: {
        type: fields.type ?? "person",
        name: fields.name,
        email: fields.email || null,
        phone: fields.phone || null,
        company: fields.company || null,
        role: fields.role || null,
        relation: fields.relation || null,
        relationDetail: fields.relationDetail || null,
        image: fields.image || null,
        favorite: fields.favorite ?? false,
        tags,
        labels: { connect: tagIds.map((id) => ({ id })) },
        notes: fields.notes || null,
        projects: { create: projectIds.map((projectId) => ({ projectId })) },
        links: { create: links.map((l, i) => ({ ...l, sortOrder: i })) },
      },
      include: contactInclude,
    });
    return NextResponse.json(contact, { status: 201 });
  } catch (error) {
    logger.error(
      "Failed to create contact",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json({ error: "Création impossible" }, { status: 500 });
  }
}
