import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { orgKindStation, slugify } from "@/lib/projets/meta";
import { organisationSelect } from "@/lib/projets/queries";
import { OrganisationInput } from "@/lib/projets/schemas";

const LOG_SOURCE = "organisations-api";

export const dynamic = "force-dynamic";

/** GET /api/organisations — all organisations with their project counts. */
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const rows = await prisma.organisation.findMany({
    select: organisationSelect,
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return NextResponse.json(rows);
}

/** POST /api/organisations — create one. */
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = OrganisationInput.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const {
    name,
    color,
    image,
    kind = "client",
    description,
    links = [],
  } = parsed.data;

  try {
    const base = slugify(name) || "organisation";
    let slug = base;
    for (
      let i = 2;
      await prisma.organisation.findUnique({ where: { slug } });
      i++
    ) {
      slug = `${base}-${i}`;
    }
    const last = await prisma.organisation.aggregate({
      _max: { sortOrder: true },
    });
    const org = await prisma.organisation.create({
      data: {
        slug,
        name,
        color: color ?? null,
        image: image || null,
        kind,
        station: orgKindStation(kind),
        description: description || null,
        links: {
          create: links.map((l, i) => ({
            kind: l.kind,
            label: l.label || null,
            url: l.url,
            sortOrder: i,
          })),
        },
        sortOrder: Math.min((last._max.sortOrder ?? 0) + 1, 98),
      },
      select: organisationSelect,
    });
    return NextResponse.json(org, { status: 201 });
  } catch (error) {
    logger.error(
      "Failed to create organisation",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Création impossible", errorKey: "api.organisations.createFailed" },
      { status: 500 }
    );
  }
}
