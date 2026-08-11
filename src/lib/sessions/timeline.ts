/**
 * A session is usually several audio files (a four-hour call recorded in
 * chunks). Every timestamp the agent ever sees is on ONE continuous timeline
 * across those files, so it can say "at 1:47:20" without also tracking which
 * file that was in. Offsets are the prefix sum of the recordings' durations, in
 * `orderIndex` order.
 */

export interface TimelineRecording {
  id: string;
  title: string;
  orderIndex: number;
  durationSec: number | null;
}

export interface TimelineEntry {
  recordingId: string;
  title: string;
  /** Seconds from the start of the session at which this recording begins. */
  offsetSec: number;
  durationSec: number;
}

/** Build the session timeline. Recordings are sorted by orderIndex, then title. */
export function buildTimeline(recordings: TimelineRecording[]): TimelineEntry[] {
  const sorted = [...recordings].sort(
    (a, b) => a.orderIndex - b.orderIndex || a.title.localeCompare(b.title)
  );

  let offset = 0;
  return sorted.map((r) => {
    const durationSec = r.durationSec ?? 0;
    const entry: TimelineEntry = {
      recordingId: r.id,
      title: r.title,
      offsetSec: offset,
      durationSec,
    };
    offset += durationSec;
    return entry;
  });
}

/** Total session length in seconds. */
export function timelineDuration(timeline: TimelineEntry[]): number {
  const last = timeline[timeline.length - 1];
  return last ? last.offsetSec + last.durationSec : 0;
}

/** Look up a recording's offset; 0 if it isn't on the timeline. */
export function offsetFor(timeline: TimelineEntry[], recordingId: string): number {
  return timeline.find((t) => t.recordingId === recordingId)?.offsetSec ?? 0;
}

/**
 * Map a global timeline position back to (recordingId, secondsIntoThatFile) —
 * needed to seek the right audio file from a digest timestamp.
 */
export function toLocal(
  timeline: TimelineEntry[],
  globalSec: number
): { recordingId: string; localSec: number } | null {
  for (const entry of timeline) {
    if (globalSec < entry.offsetSec + entry.durationSec) {
      return {
        recordingId: entry.recordingId,
        localSec: Math.max(0, globalSec - entry.offsetSec),
      };
    }
  }
  const last = timeline[timeline.length - 1];
  return last ? { recordingId: last.recordingId, localSec: last.durationSec } : null;
}

/** Format seconds as H:MM:SS (or M:SS under an hour) — the form used everywhere. */
export function formatTimestamp(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

/** Parse "1:47:20" / "12:34" / "742" into seconds. Returns null if unparseable. */
export function parseTimestamp(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);

  const parts = trimmed.split(":").map((p) => Number(p.trim()));
  if (parts.some((p) => !Number.isFinite(p) || p < 0)) return null;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}
