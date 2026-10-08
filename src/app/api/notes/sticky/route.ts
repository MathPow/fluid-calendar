import { NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";
import {
  archiveSticky,
  createSticky,
  isStickyPath,
  listSticky,
  stickyDir,
  updateSticky,
} from "@/lib/notes/sticky";
import { isNotesConfigured } from "@/lib/notes/webdav";

const LOG_SOURCE = "notes-sticky-route";

export const dynamic = "force-dynamic";

const fail = (error: unknown, what: string) => {
  logger.error(
    what,
    { error: error instanceof Error ? error.message : String(error) },
    LOG_SOURCE
  );
  return NextResponse.json(
    { error: "Couldn't reach the notes vault." },
    { status: 502 }
  );
};

const notConfigured = () =>
  NextResponse.json(
    { error: "Notes vault is not configured" },
    { status: 503 }
  );

/** GET /api/notes/sticky — the dashboard « Pense-bête » notes, newest first. */
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  if (!isNotesConfigured()) {
    return NextResponse.json({ configured: false, notes: [] });
  }
  try {
    const notes = await listSticky();
    return NextResponse.json({ configured: true, folder: stickyDir(), notes });
  } catch (error) {
    return fail(error, "Failed to list sticky notes");
  }
}

const Slug = z.string().trim().max(120).nullable();

const CreateBody = z.object({
  text: z.string().trim().min(1).max(5000),
  organisation: Slug.optional(),
});

/** POST /api/notes/sticky — add a note ({ text, organisation? slug }). */
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  if (!isNotesConfigured()) return notConfigured();
  const parsed = CreateBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  try {
    const path = await createSticky(
      parsed.data.text,
      parsed.data.organisation ?? null
    );
    return NextResponse.json({ path }, { status: 201 });
  } catch (error) {
    return fail(error, "Failed to create sticky note");
  }
}

const PatchBody = z.object({
  path: z.string().min(1).max(500),
  text: z.string().trim().min(1).max(5000).optional(),
  organisation: Slug.optional(),
  /** Move it to « Archives »: out of the box, still in Notes. */
  archive: z.boolean().optional(),
});

/** PATCH /api/notes/sticky — edit its text / organisation, or archive it. */
export async function PATCH(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  if (!isNotesConfigured()) return notConfigured();
  const parsed = PatchBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !isStickyPath(parsed.data.path)) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const { path, text, organisation, archive } = parsed.data;
  try {
    if (text !== undefined || organisation !== undefined) {
      await updateSticky(path, { text, organisation });
    }
    if (archive) {
      return NextResponse.json({ path: await archiveSticky(path) });
    }
    return NextResponse.json({ path });
  } catch (error) {
    return fail(error, "Failed to update sticky note");
  }
}
