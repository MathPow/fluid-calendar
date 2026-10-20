import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";
import { transcribeAudioBuffer } from "@/lib/recordings/transcribe";

const LOG_SOURCE = "assistant-transcribe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// The mascot's mic sends short clips (push-to-talk, ~a few seconds), so the
// GPU box on canardo is the right default: ~1s per 15s of audio with the
// Québécois turbo model. Overridable per request via WHISPER_URL/WHISPER_MODEL.
const WHISPER_URL = process.env.ASSISTANT_WHISPER_URL || "http://100.87.10.111:9093";
const WHISPER_MODEL = process.env.ASSISTANT_WHISPER_MODEL || "qc";
const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "file manquant" }, { status: 400 });
  }
  if (file.size === 0) return NextResponse.json({ error: "fichier vide" }, { status: 400 });
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "fichier > 10 Mo" }, { status: 413 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const mimeType = file.type || "audio/webm";
  const filename = (form?.get("filename") as string) || "mic.webm";

  try {
    const r = await transcribeAudioBuffer(buffer, mimeType, filename, {
      baseUrl: WHISPER_URL,
      model: WHISPER_MODEL,
      language: "fr",
    });
    return NextResponse.json({ text: r.text, language: r.language });
  } catch (err) {
    logger.error("transcribe failed", { error: String(err) }, LOG_SOURCE);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "transcription a échoué" },
      { status: 502 }
    );
  }
}
