import { readFile } from "fs/promises";

import { recordingAbsPath } from "./storage";

/**
 * Transcription via canardo's self-hosted faster-whisper server (OpenAI-compatible
 * `/v1/audio/transcriptions`). Audio never leaves the box. Reachable from the
 * app container at the host's Tailscale IP, same pattern as the Obsidian WebDAV.
 */
const WHISPER_URL = process.env.WHISPER_URL || "http://100.88.98.44:8787";
const WHISPER_MODEL = process.env.WHISPER_MODEL || "Systran/faster-whisper-base";
// Whisper on a CPU box can be slow for long audio — give it plenty of headroom.
const WHISPER_TIMEOUT_MS = Number(process.env.WHISPER_TIMEOUT_MS || 30 * 60 * 1000);

export interface TranscriptionResult {
  text: string;
  /** ISO-639-1 language whisper detected, e.g. "fr" | "en". */
  language?: string;
}

/** Transcribe a stored recording file. Throws on transport/HTTP/empty errors. */
export async function transcribeRecording(
  storagePath: string,
  mimeType: string
): Promise<TranscriptionResult> {
  const buffer = await readFile(recordingAbsPath(storagePath));

  const form = new FormData();
  form.append(
    "file",
    new Blob([buffer], { type: mimeType || "audio/mp4" }),
    storagePath
  );
  form.append("model", WHISPER_MODEL);
  // verbose_json so we also get the detected language back.
  form.append("response_format", "verbose_json");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WHISPER_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${WHISPER_URL}/v1/audio/transcriptions`, {
      method: "POST",
      body: form,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Whisper HTTP ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = (await res.json()) as { text?: string; language?: string };
  const text = (data.text ?? "").trim();
  if (!text) throw new Error("Whisper returned an empty transcript");

  return {
    text,
    language: typeof data.language === "string" ? data.language : undefined,
  };
}
