import { NextRequest, NextResponse } from "next/server";

import { authenticateIngest } from "@/lib/auth/ingest-auth";
import { newDate } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { executeCommand, interpretCommand } from "@/lib/recordings/command";
import { transcribeAudioBuffer } from "@/lib/recordings/transcribe";

const LOG_SOURCE = "voice-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * POST /api/voice — voice command to the dashboard (separate from /api/recordings,
 * which keeps meeting audio + transcripts). This one is ephemeral: it transcribes
 * the clip, asks the local LLM what to do, executes it, and returns a confirmation.
 * Nothing is stored except the resulting action (e.g. a created task).
 *
 * Auth: X-Api-Key header (RECORDINGS_API_KEY — same key as recordings).
 * Body: multipart/form-data with EITHER:
 *   file  the audio clip, OR
 *   text  an already-transcribed command (skips whisper)
 *
 * Returns: { transcript, action, ok, message, taskId? }
 */
export async function POST(request: NextRequest) {
  const auth = await authenticateIngest(request, LOG_SOURCE);
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

  let transcript: string;
  try {
    if (typeof textField === "string" && textField.trim()) {
      transcript = textField.trim();
    } else if (file instanceof File) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const result = await transcribeAudioBuffer(
        buffer,
        file.type || "audio/mp4",
        file.name || "command.m4a"
      );
      transcript = result.text;
    } else {
      return NextResponse.json(
        { error: "Provide a 'file' audio clip or a 'text' command" },
        { status: 400 }
      );
    }
  } catch (error) {
    logger.error(
      "Voice transcription failed",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Couldn't transcribe the audio." },
      { status: 502 }
    );
  }

  try {
    const todayIso = newDate().toISOString().slice(0, 10);
    const intent = await interpretCommand(transcript, todayIso);
    const result = await executeCommand(auth.userId, intent);

    logger.info(
      "Voice command handled",
      { action: result.action, ok: result.ok },
      LOG_SOURCE
    );
    return NextResponse.json(
      {
        transcript,
        action: result.action,
        ok: result.ok,
        message: result.message,
        ...(result.taskId ? { taskId: result.taskId } : {}),
      },
      { status: result.ok ? 200 : 422 }
    );
  } catch (error) {
    logger.error(
      "Voice command failed",
      {
        transcript,
        error: error instanceof Error ? error.message : String(error),
      },
      LOG_SOURCE
    );
    return NextResponse.json(
      { transcript, error: "Understood the audio but couldn't run the command." },
      { status: 502 }
    );
  }
}
