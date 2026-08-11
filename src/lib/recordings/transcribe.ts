import { readFile } from "fs/promises";

import { recordingAbsPath } from "./storage";

/**
 * Transcription via a self-hosted faster-whisper server (OpenAI-compatible
 * `/v1/audio/transcriptions`). Audio never leaves the tailnet.
 *
 * Two boxes serve this, and they are NOT interchangeable:
 *   - uguiso (100.88.98.44:8787) — the default here. No GPU, 4 cores, so `base`
 *     is the right model. Supports `hotwords`, `vad_filter` and explicit
 *     timestamp granularities.
 *   - canardo (100.87.10.111:9093) — RTX 3060, ~30x faster, and defaults to a
 *     Québécois fine-tune. But its API is narrower: `prompt` only, no
 *     `hotwords`. Work sessions target it (see lib/sessions/pipeline).
 *
 * Unknown form fields are ignored by both servers, so the options below are
 * safe to send either way — a server that lacks a lever simply doesn't apply it.
 */
const WHISPER_URL = process.env.WHISPER_URL || "http://100.88.98.44:8787";
const WHISPER_MODEL = process.env.WHISPER_MODEL || "Systran/faster-whisper-base";
// Whisper on a CPU box can be slow for long audio — give it plenty of headroom.
const WHISPER_TIMEOUT_MS = Number(process.env.WHISPER_TIMEOUT_MS || 30 * 60 * 1000);

/** One timestamped chunk of transcript, straight from whisper's verbose_json. */
export interface TranscriptSegmentData {
  startSec: number;
  endSec: number;
  text: string;
}

export interface TranscriptionResult {
  text: string;
  /** ISO-639-1 language whisper detected, e.g. "fr" | "en". */
  language?: string;
  /** Timestamped segments; empty if the server returned none. */
  segments: TranscriptSegmentData[];
  /** Audio length in seconds, as reported by whisper. */
  durationSec?: number;
}

export interface TranscribeOptions {
  /**
   * Proper nouns to bias decoding toward — company/project/speaker names.
   * faster-whisper takes these as `hotwords`, which is far more reliable than
   * stuffing them all into the prompt.
   */
  hotwords?: string;
  /**
   * Initial prompt: a sentence or two of context that primes spelling and
   * register. Whisper only conditions on ~224 tokens of it, so keep it short.
   */
  prompt?: string;
  /** Force a language (ISO-639-1) instead of letting whisper autodetect. */
  language?: string;
  /** Model override, e.g. a fine-tune. Defaults to WHISPER_MODEL. */
  model?: string;
  /** Server override — lets work sessions use the GPU box. Defaults to WHISPER_URL. */
  baseUrl?: string;
}

/** Shape of the server's verbose_json response (fields we care about). */
interface WhisperVerboseResponse {
  text?: string;
  language?: string;
  duration?: number;
  segments?: Array<{ start?: number; end?: number; text?: string }>;
}

/** Transcribe an in-memory audio buffer. Throws on transport/HTTP/empty errors. */
export async function transcribeAudioBuffer(
  buffer: Buffer,
  mimeType: string,
  filename = "audio",
  options: TranscribeOptions = {}
): Promise<TranscriptionResult> {
  const form = new FormData();
  form.append(
    "file",
    new Blob([buffer], { type: mimeType || "audio/mp4" }),
    filename
  );
  form.append("model", options.model || WHISPER_MODEL);
  // verbose_json so we also get the detected language and timestamped segments.
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "segment");
  // VAD trims silence, which on a long call both speeds things up and stops
  // whisper hallucinating text into dead air.
  form.append("vad_filter", "true");
  if (options.language) form.append("language", options.language);
  if (options.hotwords) form.append("hotwords", options.hotwords);
  if (options.prompt) form.append("prompt", options.prompt);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WHISPER_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${options.baseUrl || WHISPER_URL}/v1/audio/transcriptions`, {
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

  const data = (await res.json()) as WhisperVerboseResponse;

  const segments: TranscriptSegmentData[] = (data.segments ?? [])
    .map((s) => ({
      startSec: typeof s.start === "number" ? s.start : 0,
      endSec: typeof s.end === "number" ? s.end : 0,
      text: (s.text ?? "").trim(),
    }))
    .filter((s) => s.text !== "");

  // Prefer the flat `text`, but fall back to stitching segments — some server
  // versions omit it when streaming is off.
  const text =
    (data.text ?? "").trim() || segments.map((s) => s.text).join(" ").trim();
  if (!text) throw new Error("Whisper returned an empty transcript");

  return {
    text,
    language: typeof data.language === "string" ? data.language : undefined,
    segments,
    durationSec: typeof data.duration === "number" ? data.duration : undefined,
  };
}

/** Transcribe a stored recording file. Throws on transport/HTTP/empty errors. */
export async function transcribeRecording(
  storagePath: string,
  mimeType: string,
  options: TranscribeOptions = {}
): Promise<TranscriptionResult> {
  const buffer = await readFile(recordingAbsPath(storagePath));
  return transcribeAudioBuffer(buffer, mimeType, storagePath, options);
}
