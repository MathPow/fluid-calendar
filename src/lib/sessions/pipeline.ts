import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { transcribeRecording } from "@/lib/recordings/transcribe";

import { buildDigest, chunkSegments, renderToc, summarizeChunk, type ChunkSummary } from "./digest";
import { lexiconToTranscribeOptions } from "./lexicon";
import { sessionSegments } from "./search";

const LOG_SOURCE = "session-pipeline";

/**
 * Work sessions transcribe on canardo, not on the box the recordings pipeline
 * uses. A four-hour call is the whole point of this feature, and canardo's RTX
 * 3060 does it in minutes where uguiso's 4 CPU cores would take longer than the
 * call itself. Its default model is a Québécois fine-tune, which matters more
 * than raw model size on these recordings.
 *
 * The trade-off: canardo's API takes `prompt` but not `hotwords`, so the lexicon
 * reaches it as an initial prompt only. Point SESSION_WHISPER_URL at the uguiso
 * server if you'd rather have hotwords than speed.
 */
const SESSION_WHISPER_URL =
  process.env.SESSION_WHISPER_URL || "http://100.87.10.111:9093";
const SESSION_WHISPER_MODEL = process.env.SESSION_WHISPER_MODEL || "qc";

/**
 * Compiling a session = transcribe every audio file with the session's lexicon,
 * then build the digest + table of contents from the result.
 *
 * Same serial-queue shape as the recordings pipeline: canardo's GPU does one
 * thing at a time, and a four-hour session is a long job. The queue is in-memory
 * and best-effort — a restart drops it, and `recompile` picks up where it left
 * off because transcription results are persisted per recording as they land.
 */
let chain: Promise<void> = Promise.resolve();
const queued = new Set<string>();

/** Enqueue a session for compilation. Fire-and-forget. */
export function enqueueSession(sessionId: string): void {
  if (queued.has(sessionId)) return;
  queued.add(sessionId);
  chain = chain
    .then(() => compileSession(sessionId))
    .catch((error) => {
      logger.error(
        "Session compile crashed",
        {
          sessionId,
          error: error instanceof Error ? error.message : String(error),
        },
        LOG_SOURCE
      );
    })
    .finally(() => {
      queued.delete(sessionId);
    });
}

/** True when a session is already waiting or running. */
export function isQueued(sessionId: string): boolean {
  return queued.has(sessionId);
}

/**
 * Transcribe one recording with the session's lexicon and persist the transcript
 * plus its timestamped segments. Segments are written in a transaction with the
 * transcript so we never end up with one and not the other.
 */
async function transcribeForSession(
  recording: {
    id: string;
    storagePath: string;
    mimeType: string;
    title: string;
    durationSec: number | null;
  },
  session: { title: string; lexicon: string | null; language: string | null; model: string | null }
): Promise<void> {
  const { hotwords, prompt } = lexiconToTranscribeOptions(session.lexicon, {
    title: session.title,
    language: session.language ?? undefined,
  });

  await prisma.recording.update({
    where: { id: recording.id },
    data: { status: "processing", statusError: null },
  });

  const result = await transcribeRecording(recording.storagePath, recording.mimeType, {
    hotwords,
    prompt,
    language: session.language ?? undefined,
    baseUrl: SESSION_WHISPER_URL,
    model: session.model ?? SESSION_WHISPER_MODEL,
  });

  await prisma.$transaction([
    prisma.transcriptSegment.deleteMany({ where: { recordingId: recording.id } }),
    prisma.transcriptSegment.createMany({
      data: result.segments.map((seg, idx) => ({
        recordingId: recording.id,
        idx,
        startSec: seg.startSec,
        endSec: seg.endSec,
        text: seg.text,
      })),
    }),
    prisma.recording.update({
      where: { id: recording.id },
      data: {
        transcript: result.text,
        language: result.language ?? null,
        // Whisper's duration is authoritative and is what the session timeline
        // is built from — without it, offsets between files would be wrong.
        durationSec:
          result.durationSec != null
            ? Math.round(result.durationSec)
            : recording.durationSec,
        status: "done",
        statusError: null,
      },
    }),
  ]);
}

/**
 * Run the full compile for one session. Safe to re-run: recordings that already
 * have segments are skipped unless `force` is set.
 */
export async function compileSession(
  sessionId: string,
  opts?: { force?: boolean }
): Promise<void> {
  const session = await prisma.workSession.findUnique({
    where: { id: sessionId },
    include: {
      recordings: {
        orderBy: { orderIndex: "asc" },
        include: { _count: { select: { segments: true } } },
      },
    },
  });
  if (!session) return;

  await prisma.workSession.update({
    where: { id: sessionId },
    data: { status: "processing", statusError: null },
  });
  logger.info(
    "Session compile started",
    { sessionId, recordings: session.recordings.length },
    LOG_SOURCE
  );

  try {
    if (session.recordings.length === 0) {
      throw new Error("Cette session n'a aucun fichier audio.");
    }

    // --- 1. Transcribe (the slow part; each result persisted as it lands) ---
    for (const rec of session.recordings) {
      if (!opts?.force && rec._count.segments > 0) continue;
      try {
        await transcribeForSession(rec, session);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await prisma.recording.update({
          where: { id: rec.id },
          data: { status: "error", statusError: message.slice(0, 500) },
        });
        throw new Error(`Transcription de « ${rec.title} » : ${message}`);
      }
    }

    // --- 2. Map: one summary per ~10 minutes ---
    const segments = await sessionSegments(prisma, sessionId);
    if (segments.length === 0) {
      throw new Error("Aucun segment de transcription — l'audio est-il silencieux ?");
    }

    const chunks = chunkSegments(segments);
    const ctx = {
      title: session.title,
      brief: session.brief,
      language: session.language,
    };

    const summaries: ChunkSummary[] = [];
    for (const chunk of chunks) {
      // Serial on purpose: parallel calls would thrash the single GPU and make
      // the whole compile slower, not faster.
      summaries.push(await summarizeChunk(chunk, ctx));
    }

    const toc = renderToc(summaries);

    // --- 3. Reduce: the digest, from summaries only ---
    const digest = await buildDigest(summaries, ctx);

    await prisma.workSession.update({
      where: { id: sessionId },
      data: {
        toc,
        digest,
        status: "ready",
        statusError: null,
        compiledAt: new Date(),
      },
    });
    logger.info(
      "Session compile finished",
      { sessionId, chunks: chunks.length, segments: segments.length },
      LOG_SOURCE
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("Session compile failed", { sessionId, error: message }, LOG_SOURCE);
    await prisma.workSession.update({
      where: { id: sessionId },
      data: { status: "error", statusError: message.slice(0, 500) },
    });
  }
}
