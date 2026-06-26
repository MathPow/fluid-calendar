import { createHash } from "crypto";
import { existsSync } from "fs";
import { mkdir, unlink, writeFile } from "fs/promises";
import path from "path";

/**
 * Root directory where recording audio files are stored on disk. Defaults to
 * `<cwd>/data/recordings`, but in production set RECORDINGS_DIR to a path that
 * lives on a persistent volume (a Coolify-mounted dir), otherwise files are
 * lost on redeploy.
 */
export function recordingsDir(): string {
  return process.env.RECORDINGS_DIR || path.join(process.cwd(), "data", "recordings");
}

/** Strip path separators / traversal from a client-supplied filename. */
function sanitizeFileName(name: string): string {
  const base = path.basename(name).replace(/[^a-zA-Z0-9._-]/g, "_");
  return base || "recording";
}

/**
 * Persist an uploaded audio buffer under RECORDINGS_DIR. Files are namespaced by
 * recording id to avoid collisions; returns the path relative to RECORDINGS_DIR
 * (stored on the DB row as `storagePath`).
 */
export async function saveRecordingFile(
  recordingId: string,
  fileName: string,
  data: Buffer
): Promise<string> {
  const dir = recordingsDir();
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
  const relPath = `${recordingId}-${sanitizeFileName(fileName)}`;
  await writeFile(path.join(dir, relPath), data);
  return relPath;
}

/** Absolute path on disk for a stored recording. */
export function recordingAbsPath(storagePath: string): string {
  // Guard against traversal even though storagePath is server-generated.
  const safe = path.basename(storagePath);
  return path.join(recordingsDir(), safe);
}

/** Delete a recording's file from disk; ignores a missing file. */
export async function deleteRecordingFile(storagePath: string): Promise<void> {
  try {
    await unlink(recordingAbsPath(storagePath));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

/** Best-effort content-type → file extension hint, used only for display. */
export function extForMime(mime: string): string {
  const map: Record<string, string> = {
    "audio/mp4": "m4a",
    "audio/x-m4a": "m4a",
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
    "audio/webm": "webm",
    "audio/ogg": "ogg",
  };
  return map[mime] ?? "audio";
}

/** Constant-time-ish comparison so the API key check doesn't leak length/timing. */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest("hex");
  const hb = createHash("sha256").update(b).digest("hex");
  return ha === hb;
}
