import { NextRequest, NextResponse } from "next/server";

import { authenticateUpload } from "@/lib/auth/ingest-auth";
import { newDate } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { executeCommand, interpretCommand } from "@/lib/recordings/command";
import { transcribeAudioBuffer } from "@/lib/recordings/transcribe";

const LOG_SOURCE = "voice-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type VoiceInput =
  | { kind: "text"; text: string }
  | { kind: "audio"; buffer: Buffer; mimeType: string; filename: string };

/**
 * POST /api/voice — voice command to the dashboard (separate from /api/recordings,
 * which keeps meeting audio + transcripts). Ephemeral: it transcribes the clip,
 * asks the local LLM what to do, and executes it (e.g. creates a task).
 *
 * Fire-and-forget: as soon as the audio is received we ack with 200
 * {status:"processing"} and run whisper + the LLM in the background, so the
 * Shortcut / Watch never waits on the slow CPU pipeline. The action still lands
 * (check Tasks); errors are logged server-side.
 *
 * Auth: X-Api-Key header (RECORDINGS_API_KEY — same key as recordings).
 * Body: multipart/form-data with EITHER:
 *   file  the audio clip, OR
 *   text  an already-transcribed command (skips whisper)
 */
export async function POST(request: NextRequest) {
  const auth = await authenticateUpload(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected multipart/form-data" },
      { status: 400 }
    );
  }

  const textField = form.get("text");
  const file = form.get("file");

  // Read the body now (while the request is open), but don't process yet.
  let input: VoiceInput;
  if (typeof textField === "string" && textField.trim()) {
    input = { kind: "text", text: textField.trim() };
  } else if (file instanceof File) {
    input = {
      kind: "audio",
      buffer: Buffer.from(await file.arrayBuffer()),
      mimeType: file.type || "audio/mp4",
      filename: file.name || "command.m4a",
    };
  } else {
    return NextResponse.json(
      { error: "Provide a 'file' audio clip or a 'text' command" },
      { status: 400 }
    );
  }

  // Process in the background; ack immediately.
  void runVoiceCommand(auth.userId, input).catch((error) => {
    logger.error(
      "Voice command failed",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
  });

  return NextResponse.json({ status: "processing" }, { status: 200 });
}

/** Transcribe (if needed), interpret, and execute a voice command. */
async function runVoiceCommand(userId: string, input: VoiceInput): Promise<void> {
  const transcript =
    input.kind === "text"
      ? input.text
      : (
          await transcribeAudioBuffer(input.buffer, input.mimeType, input.filename)
        ).text;

  const nowIso = newDate().toISOString();
  const intent = await interpretCommand(transcript, nowIso);
  const result = await executeCommand(userId, intent);

  logger.info(
    "Voice command handled",
    { action: result.action, ok: result.ok, message: result.message },
    LOG_SOURCE
  );
}
