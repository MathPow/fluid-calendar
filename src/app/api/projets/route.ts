import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { projectInclude, uniqueSlug } from "@/lib/projets/queries";
import { ProjectInput } from "@/lib/projets/schemas";

const LOG_SOURCE = "projets-api";

export const dynamic = "force-dynamic";

/** GET /api/projets — every project with its links, contacts and children. */
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;

  const station = request.nextUrl.searchParams.get("station");
  const projects = await prisma.agentProject.findMany({
    where: {
      archived: false,
      ...(station === "personal" || station === "work" ? { station } : {}),
    },
    include: projectInclude,
    orderBy: [{ lastActivityAt: "desc" }, { name: "asc" }],
  });
  return NextResponse.json(projects);
}

/** POST /api/projets — create a project (optionally as a sub-project). */
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = ProjectInput.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { links = [], contacts = [], stack = [], ...fields } = parsed.data;

  let organisationId = fields.organisationId ?? null;
  if (fields.parentId) {
    const parent = await prisma.agentProject.findUnique({
      where: { id: fields.parentId },
      select: { id: true, organisationId: true },
    });
    if (!parent) {
      return NextResponse.json({ error: "Projet parent introuvable" }, { status: 400 });
    }
    // A sub-project lives in its parent's organisation unless told otherwise.
    if (fields.organisationId === undefined) organisationId = parent.organisationId;
  }

  try {
    const slug = await uniqueSlug(fields.name);
    const project = await prisma.agentProject.create({
      data: {
        slug,
        name: fields.name,
        color: fields.color ?? null,
        image: fields.image || null,
        station: fields.station ?? "personal",
        description: fields.description || null,
        path: fields.path || null,
        parentId: fields.parentId ?? null,
        organisationId,
        stack,
        links: {
          create: links.map((l, i) => ({
            kind: l.kind,
            label: l.label || null,
            url: l.url,
            sortOrder: i,
          })),
        },
        contacts: {
          create: contacts.map((c) => ({
            contactId: c.contactId,
            role: c.role || null,
          })),
        },
      },
      include: projectInclude,
    });
    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    logger.error(
      "Failed to create project",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json({ error: "Création impossible" }, { status: 500 });
  }
}
