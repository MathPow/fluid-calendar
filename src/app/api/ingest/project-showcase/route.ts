import { NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { safeEqual } from "@/lib/recordings/storage";

const LOG_SOURCE = "project-showcase-ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Screenshots are inlined as data URLs, so pages run a few MB. Cap it well
// below what Postgres TEXT allows so a runaway page can't bloat the DB.
const MAX_HTML_BYTES = 20 * 1024 * 1024;

const BodySchema = z.object({
  project: z.string().min(1), // slug, same as the activity feed
  path: z.string().optional(),
  html: z.string().min(1),
  description: z.string().optional(), // only fills an empty description
  // Project avatar, typically the site's favicon. Fills an empty image only,
  // unless replaceImage is set.
  image: z
    .string()
    .max(512 * 1024)
    .regex(
      /^(data:image\/(png|jpeg|webp|gif|svg\+xml|x-icon|vnd\.microsoft\.icon);base64,|https:\/\/)/
    )
    .optional(),
  replaceImage: z.boolean().optional(),
  // Organisation slug or name (DehorsQC, StayChum…). Only files a project that
  // has none or sits in the default bucket; "?" just lists the choices.
  organisation: z.string().min(1).optional(),
});

/** Same static token as /api/ingest/project-activity (PROJECT_INGEST_TOKEN). */
function tokenOk(request: NextRequest): boolean {
  const expected = process.env.PROJECT_INGEST_TOKEN;
  if (!expected) return false;
  const bearer = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "");
  const provided = bearer || request.headers.get("x-api-key") || "";
  return provided.length > 0 && safeEqual(provided, expected);
}

/**
 * PUT /api/ingest/project-showcase — store the HTML showcase of a project,
 * replacing the previous one. Creates the project if the slug is new.
 * Pushed by the /project-showcase Claude skill.
 */
export async function PUT(request: NextRequest) {
  if (!process.env.PROJECT_INGEST_TOKEN) {
    return NextResponse.json(
      { error: "Ingest not configured" },
      { status: 503 }
    );
  }
  if (!tokenOk(request)) {
    logger.warn("project-showcase ingest rejected: bad token", {}, LOG_SOURCE);
    return new NextResponse("Unauthorized", { status: 401 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const {
    project,
    path,
    html,
    description,
    image,
    replaceImage,
    organisation,
  } = parsed.data;
  if (Buffer.byteLength(html) > MAX_HTML_BYTES) {
    return NextResponse.json({ error: "Showcase too large" }, { status: 413 });
  }

  let org: { id: string; name: string } | null = null;
  if (organisation) {
    const orgs = await prisma.organisation.findMany({
      select: { id: true, slug: true, name: true },
      orderBy: { sortOrder: "asc" },
    });
    const wanted = organisation.toLowerCase();
    org =
      orgs.find((o) => o.slug === wanted || o.name.toLowerCase() === wanted) ??
      null;
    if (!org) {
      return NextResponse.json(
        {
          error:
            organisation === "?" ? "Organisations" : "Unknown organisation",
          organisations: orgs.map((o) => ({ slug: o.slug, name: o.name })),
        },
        { status: 422 }
      );
    }
  }

  try {
    const proj = await prisma.agentProject.upsert({
      where: { slug: project },
      create: {
        slug: project,
        name: project,
        path: path ?? null,
        description: description ?? null,
        image: image ?? null,
      },
      update: path ? { path } : {},
    });
    // Never move a project the user already filed elsewhere; only rescue it
    // from "no organisation" or the default bucket.
    let orgKept: string | null = null;
    let fileInOrg = false;
    if (org && proj.organisationId !== org.id) {
      const current = proj.organisationId
        ? await prisma.organisation.findUnique({
            where: { id: proj.organisationId },
            select: { name: true, isDefault: true },
          })
        : null;
      if (!current || current.isDefault) fileInOrg = true;
      else orgKept = current.name;
    }
    const fill = {
      ...(org && fileInOrg ? { organisationId: org.id } : {}),
      ...(description && !proj.description ? { description } : {}),
      ...(image && (replaceImage || !proj.image) ? { image } : {}),
    };
    if (Object.keys(fill).length > 0) {
      await prisma.agentProject.update({ where: { id: proj.id }, data: fill });
    }

    await prisma.projectShowcase.upsert({
      where: { projectId: proj.id },
      create: { projectId: proj.id, html },
      update: { html },
    });

    return NextResponse.json(
      {
        ok: true,
        projectId: proj.id,
        ...(org
          ? { organisation: orgKept ? `kept ${orgKept}` : org.name }
          : {}),
        url: `/projets/${encodeURIComponent(proj.slug)}?vue=apercu`,
      },
      { status: 201 }
    );
  } catch (error) {
    logger.error(
      "Failed to ingest project showcase",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Failed to store showcase" },
      { status: 500 }
    );
  }
}
