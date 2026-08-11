import type { PrismaClient } from "@prisma/client";

import { buildTimeline, formatTimestamp, offsetFor, type TimelineEntry } from "./timeline";

/**
 * Level-3 retrieval: the agent has read the digest and the table of contents,
 * and now wants the actual words. Two ways in — by time window (it knows where
 * to look) or by search (it doesn't).
 *
 * Search runs on Postgres full-text with the 'french' configuration, so
 * "pricing" matches "pricings" and stopwords don't drown the ranking. The GIN
 * index backing it is created in the migration.
 *
 * Every function takes the Prisma client explicitly: the MCP server runs outside
 * Next (its own client, no `@/` path alias), and these are its main tools.
 */

/** Minimal client surface these helpers need — satisfied by any PrismaClient. */
type Client = Pick<PrismaClient, "recording" | "transcriptSegment" | "$queryRaw">;

export interface SegmentHit {
  /** Position on the session-wide timeline. */
  startSec: number;
  endSec: number;
  /** Human-readable "1:47:20", for citing back to the user. */
  timestamp: string;
  text: string;
  recordingId: string;
  recordingTitle: string;
}

/** Load a session's timeline (recordings ordered, with their offsets). */
export async function sessionTimeline(
  client: Client,
  sessionId: string
): Promise<TimelineEntry[]> {
  const recordings = await client.recording.findMany({
    where: { sessionId },
    select: { id: true, title: true, orderIndex: true, durationSec: true },
    orderBy: { orderIndex: "asc" },
  });
  return buildTimeline(recordings);
}

/**
 * Verbatim transcript for a window of the session timeline. This is the tool an
 * agent reaches for after the table of contents told it which minutes matter.
 */
export async function getSegmentRange(
  client: Client,
  sessionId: string,
  fromSec: number,
  toSec: number,
  opts?: { maxChars?: number }
): Promise<{ text: string; hits: SegmentHit[]; truncated: boolean }> {
  const timeline = await sessionTimeline(client, sessionId);
  if (timeline.length === 0) return { text: "", hits: [], truncated: false };

  // Translate the requested global window into a per-recording local window, so
  // the database only scans the files that actually overlap it.
  const hits: SegmentHit[] = [];
  for (const entry of timeline) {
    const localFrom = fromSec - entry.offsetSec;
    const localTo = toSec - entry.offsetSec;
    if (localTo < 0 || localFrom > entry.durationSec) continue;

    const rows = await client.transcriptSegment.findMany({
      where: {
        recordingId: entry.recordingId,
        startSec: { lt: Math.max(0, localTo) },
        endSec: { gt: Math.max(0, localFrom) },
      },
      orderBy: { startSec: "asc" },
    });

    for (const row of rows) {
      hits.push({
        startSec: row.startSec + entry.offsetSec,
        endSec: row.endSec + entry.offsetSec,
        timestamp: formatTimestamp(row.startSec + entry.offsetSec),
        text: row.text,
        recordingId: entry.recordingId,
        recordingTitle: entry.title,
      });
    }
  }

  hits.sort((a, b) => a.startSec - b.startSec);

  // Cap the payload — an agent asking for a 3-hour window shouldn't blow its own
  // context by accident. It gets a clear truncation marker and can page.
  const maxChars = opts?.maxChars ?? 60000;
  let text = "";
  let truncated = false;
  for (const hit of hits) {
    const line = `[${hit.timestamp}] ${hit.text}\n`;
    if (text.length + line.length > maxChars) {
      truncated = true;
      break;
    }
    text += line;
  }

  return { text: text.trimEnd(), hits, truncated };
}

/** One full-text hit as returned by the raw query (local, per-recording times). */
interface RawHit {
  recordingId: string;
  startSec: number;
  endSec: number;
  text: string;
}

/**
 * Full-text search across a session's transcript. Returns ranked segments with
 * timeline timestamps, so the agent can then pull the surrounding minutes.
 */
export async function searchTranscript(
  client: Client,
  sessionId: string,
  query: string,
  opts?: { limit?: number }
): Promise<SegmentHit[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const limit = Math.min(Math.max(opts?.limit ?? 15, 1), 100);
  const timeline = await sessionTimeline(client, sessionId);
  if (timeline.length === 0) return [];

  // websearch_to_tsquery understands quoted phrases, OR and -exclusions, and —
  // unlike to_tsquery — never throws on user punctuation.
  const rows = await client.$queryRaw<RawHit[]>`
    SELECT s."recordingId",
           s."startSec",
           s."endSec",
           s."text"
    FROM "TranscriptSegment" s
    JOIN "Recording" r ON r."id" = s."recordingId"
    CROSS JOIN websearch_to_tsquery('french', ${trimmed}) q
    WHERE r."sessionId" = ${sessionId}
      AND to_tsvector('french', s."text") @@ q
    ORDER BY ts_rank(to_tsvector('french', s."text"), q) DESC, s."startSec" ASC
    LIMIT ${limit}
  `;

  const titleById = new Map(timeline.map((t) => [t.recordingId, t.title]));

  return rows.map((row) => {
    const offset = offsetFor(timeline, row.recordingId);
    return {
      startSec: row.startSec + offset,
      endSec: row.endSec + offset,
      timestamp: formatTimestamp(row.startSec + offset),
      text: row.text,
      recordingId: row.recordingId,
      recordingTitle: titleById.get(row.recordingId) ?? "",
    };
  });
}

/** All of a session's segments on the global timeline — used by the compile step. */
export async function sessionSegments(client: Client, sessionId: string) {
  const timeline = await sessionTimeline(client, sessionId);
  const out: Array<{
    recordingId: string;
    startSec: number;
    endSec: number;
    text: string;
  }> = [];

  for (const entry of timeline) {
    const rows = await client.transcriptSegment.findMany({
      where: { recordingId: entry.recordingId },
      orderBy: { idx: "asc" },
    });
    for (const row of rows) {
      out.push({
        recordingId: entry.recordingId,
        startSec: row.startSec + entry.offsetSec,
        endSec: row.endSec + entry.offsetSec,
        text: row.text,
      });
    }
  }

  return out;
}
