import { NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { safeEqual } from "@/lib/recordings/storage";

const LOG_SOURCE = "project-showcase-ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_MEDIA = 24;
const MAX_MEDIA_BYTES = 4 * 1024 * 1024;

const DATA_URL =
  /^data:(image\/(?:png|jpeg|webp|gif|avif));base64,([A-Za-z0-9+/=]+)$/;

const MediaSchema = z.object({
  name: z.string().min(1).max(80),
  caption: z.string().max(200).optional(),
  data: z.string().regex(DATA_URL),
  capsule: z.boolean().optional(),
  inGallery: z.boolean().optional(),
});

const BodySchema = z.object({
  project: z.string().min(1), // slug, same as the activity feed
  path: z.string().optional(),
  // Short description (the Steam blurb). Fills an empty one unless replaceDescription.
  description: z.string().max(600).optional(),
  replaceDescription: z.boolean().optional(),
  about: z.string().max(40_000).optional(),
  status: z.string().max(40).optional(),
  startedAt: z.string().date().optional(),
  tags: z.array(z.string().min(1).max(40)).max(20).optional(),
  // Links are added when their URL isn't on the project yet; never removed.
  links: z
    .array(
      z.object({
        kind: z.string().min(1).max(20),
        url: z.string().url(),
        label: z.string().max(80).optional(),
      })
    )
    .max(10)
    .optional(),
  media: z.array(MediaSchema).max(MAX_MEDIA).optional(),
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
 * PUT /api/ingest/project-showcase — store a project's store page (gallery,
 * about text, facts). The gallery and page fields are replaced wholesale; the
 * project's own fields (description, avatar, organisation, links) are only
 * filled when empty so edits made in DreamDash win. Creates the project if
 * the slug is new. Pushed by the /project-showcase Claude skill.
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
  const body = parsed.data;

  const media = (body.media ?? []).map((m, i) => {
    const [, mime, b64] = m.data.match(DATA_URL)!;
    return {
      name: m.name,
      caption: m.caption ?? null,
      mime,
      data: Buffer.from(b64, "base64"),
      capsule: m.capsule ?? false,
      inGallery: m.inGallery ?? true,
      sortOrder: i,
    };
  });
  const tooBig = media.find((m) => m.data.length > MAX_MEDIA_BYTES);
  if (tooBig) {
    return NextResponse.json(
      { error: `Media too large: ${tooBig.name}` },
      { status: 413 }
    );
  }

  let org: { id: string; name: string } | null = null;
  if (body.organisation) {
    const orgs = await prisma.organisation.findMany({
      select: { id: true, slug: true, name: true },
      orderBy: { sortOrder: "asc" },
    });
    const wanted = body.organisation.toLowerCase();
    org =
      orgs.find((o) => o.slug === wanted || o.name.toLowerCase() === wanted) ??
      null;
    if (!org) {
      return NextResponse.json(
        {
          error:
            body.organisation === "?"
              ? "Organisations"
              : "Unknown organisation",
          organisations: orgs.map((o) => ({ slug: o.slug, name: o.name })),
        },
        { status: 422 }
      );
    }
  }

  try {
    const proj = await prisma.agentProject.upsert({
      where: { slug: body.project },
      create: {
        slug: body.project,
        name: body.project,
        path: body.path ?? null,
      },
      update: body.path ? { path: body.path } : {},
      include: { links: { select: { url: true, sortOrder: true } } },
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

    const known = new Set(proj.links.map((l) => l.url.replace(/\/$/, "")));
    const newLinks = (body.links ?? []).filter(
      (l) => !known.has(l.url.replace(/\/$/, ""))
    );
    const nextSort = Math.max(-1, ...proj.links.map((l) => l.sortOrder)) + 1;

    const pageFields = {
      about: body.about ?? null,
      status: body.status ?? null,
      startedAt: body.startedAt ? new Date(body.startedAt) : null,
      tags: body.tags ?? [],
    };

    await prisma.$transaction([
      prisma.agentProject.update({
        where: { id: proj.id },
        data: {
          ...(body.description && (body.replaceDescription || !proj.description)
            ? { description: body.description }
            : {}),
          ...(body.image && (body.replaceImage || !proj.image)
            ? { image: body.image }
            : {}),
          ...(org && fileInOrg ? { organisationId: org.id } : {}),
        },
      }),
      prisma.projectLink.createMany({
        data: newLinks.map((l, i) => ({
          projectId: proj.id,
          kind: l.kind,
          url: l.url,
          label: l.label ?? null,
          sortOrder: nextSort + i,
        })),
      }),
      prisma.projectShowcase.upsert({
        where: { projectId: proj.id },
        create: { projectId: proj.id, ...pageFields },
        update: pageFields,
      }),
      prisma.projectMedia.deleteMany({ where: { projectId: proj.id } }),
      prisma.projectMedia.createMany({
        data: media.map((m) => ({ projectId: proj.id, ...m })),
      }),
    ]);

    return NextResponse.json(
      {
        ok: true,
        projectId: proj.id,
        media: media.length,
        linksAdded: newLinks.length,
        ...(org
          ? { organisation: orgKept ? `kept ${orgKept}` : org.name }
          : {}),
        url: `/projets/${encodeURIComponent(proj.slug)}`,
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
