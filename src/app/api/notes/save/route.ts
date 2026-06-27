import { NextRequest, NextResponse } from "next/server";

import { authenticateUpload } from "@/lib/auth/ingest-auth";
import { logger } from "@/lib/logger";
import { isNotesConfigured, saveNote } from "@/lib/notes/webdav";

const LOG_SOURCE = "notes-save-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/notes/save — save a note into the vault inbox folder. Used by the
 * in-app drop zone for dropped/typed text notes. Accepts multipart (a dropped
 * .md/.txt `file`) or JSON ({ name, content }). Auth: session or X-Api-Key.
 */
export async function POST(request: NextRequest) {
  const auth = await authenticateUpload(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;

  if (!isNotesConfigured()) {
    return NextResponse.json(
      { error: "Notes vault is not configured" },
      { status: 503 }
    );
  }

  let name = "";
  let content = "";
  const contentType = request.headers.get("content-type") || "";

  try {
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      const nameField = form.get("name");
      if (file instanceof File) {
        name = (typeof nameField === "string" && nameField) || file.name || "note";
        content = await file.text();
      } else {
        const text = form.get("content");
        name = typeof nameField === "string" ? nameField : "note";
        content = typeof text === "string" ? text : "";
      }
    } else {
      const body = await request.json();
      name = String(body.name ?? "note");
      content = String(body.content ?? "");
    }
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!content.trim()) {
    return NextResponse.json({ error: "Note is empty" }, { status: 400 });
  }

  try {
    const path = await saveNote(name, content);
    logger.info("Note saved to vault", { path }, LOG_SOURCE);
    return NextResponse.json({ path, status: "saved" }, { status: 201 });
  } catch (error) {
    logger.error(
      "Failed to save note",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Couldn't write the note to your vault." },
      { status: 502 }
    );
  }
}
