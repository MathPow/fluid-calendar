import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

import { generateTitle, summarizeTranscript } from "./summarize";
import { transcribeRecording } from "./transcribe";

const LOG_SOURCE = "recordings-pipeline";

/**
 * True when the recording still has its ingest-default title (the original
 * filename, or a generic voice-memo name) — i.e. safe to auto-rename. Avoids
 * clobbering a title the client/user set deliberately.
 */
function isDefaultTitle(title: string, fileName: string): boolean {
  const stem = fileName.replace(/\.[^.]+$/, "");
  if (title.trim() === stem.trim()) return true;
  return /^(enregistrement audio|nouvel enregistrement|new recording|audio recording|recording|voice memo|m[ée]mo vocal|untitled)\b/i.test(
    title.trim()
  );
}

/**
 * In-process serial queue. canardo is a weak CPU box (no GPU), so we transcribe
 * + summarize one recording at a time rather than thrashing under concurrent
 * whisper/LLM loads. This is best-effort and in-memory — a server restart drops
 * the queue, but `requeueStuck()` and the manual reprocess endpoint recover.
 */
let chain: Promise<void> = Promise.resolve();
const queued = new Set<string>();

/** Enqueue a recording for transcription + summary. Fire-and-forget. */
export function enqueueProcessing(id: string): void {
  if (queued.has(id)) return;
  queued.add(id);
  chain = chain
    .then(() => processRecording(id))
    .catch((error) => {
      logger.error(
        "Recording pipeline crashed",
        { id, error: error instanceof Error ? error.message : String(error) },
        LOG_SOURCE
      );
    })
    .finally(() => {
      queued.delete(id);
    });
}

/**
 * Run the pipeline for one recording: transcribe if there's no transcript yet,
 * then summarize if there's no summary yet. Each step is persisted as it lands
 * so a failure in summary still keeps the transcript.
 */
export async function processRecording(id: string): Promise<void> {
  const rec = await prisma.recording.findUnique({ where: { id } });
  if (!rec) return;
  if (rec.transcript && rec.summary) {
    // Already processed — still backfill a title if it's the default name.
    if (isDefaultTitle(rec.title, rec.fileName)) {
      try {
        const title = await generateTitle(rec.transcript, rec.language ?? undefined);
        if (title) await prisma.recording.update({ where: { id }, data: { title } });
      } catch {
        // keep default title
      }
    }
    await prisma.recording.update({ where: { id }, data: { status: "done" } });
    return;
  }

  await prisma.recording.update({
    where: { id },
    data: { status: "processing", statusError: null },
  });
  logger.info("Recording pipeline started", { id, source: rec.source }, LOG_SOURCE);

  try {
    let transcript = rec.transcript;
    let language = rec.language ?? undefined;
    if (!transcript) {
      const result = await transcribeRecording(rec.storagePath, rec.mimeType);
      transcript = result.text;
      language = result.language;
      await prisma.recording.update({
        where: { id },
        data: { transcript, language: result.language ?? null },
      });
    }

    if (!rec.summary && transcript) {
      const summary = await summarizeTranscript(transcript, {
        title: rec.title,
        language,
      });
      await prisma.recording.update({ where: { id }, data: { summary } });
    }

    // Replace the default "Enregistrement audio …" filename with a generated
    // title. Non-fatal: a title failure must not fail the recording.
    if (transcript && isDefaultTitle(rec.title, rec.fileName)) {
      try {
        const title = await generateTitle(transcript, language);
        if (title) {
          await prisma.recording.update({ where: { id }, data: { title } });
        }
      } catch (error) {
        logger.warn(
          "Auto-title failed; keeping default",
          { id, error: error instanceof Error ? error.message : String(error) },
          LOG_SOURCE
        );
      }
    }

    await prisma.recording.update({
      where: { id },
      data: { status: "done", statusError: null },
    });
    logger.info("Recording pipeline finished", { id }, LOG_SOURCE);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("Recording pipeline failed", { id, error: message }, LOG_SOURCE);
    await prisma.recording.update({
      where: { id },
      data: { status: "error", statusError: message.slice(0, 500) },
    });
  }
}

/**
 * Re-enqueue recordings left "pending"/"processing" by a crash or restart, plus
 * any "error" rows for a single best-effort retry. Called opportunistically.
 */
export async function requeueStuck(userId: string): Promise<void> {
  const stuck = await prisma.recording.findMany({
    where: { userId, status: { in: ["pending", "processing"] } },
    select: { id: true },
  });
  for (const r of stuck) enqueueProcessing(r.id);
}
