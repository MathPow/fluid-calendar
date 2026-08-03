/**
 * Gathers the context the "Ask AI" search bar reasons over: tasks, calendar
 * events, Obsidian notes, recordings, task projects and the Projets agent
 * activity feed — all in one pass, all attributable back to a clickable URL.
 *
 * Two retrieval passes per source:
 *   - keyword hits, from {@link extractKeywords} over the question;
 *   - a recency/relevance baseline, so purely temporal questions ("what's on
 *     tomorrow?") still get context when the question has no content words.
 *
 * Everything is then interleaved across sources and trimmed to a character
 * budget, because the local model's prompt-eval cost is what makes this slow.
 */
import { logger } from "@/lib/logger";
import { isNotesConfigured, listVault, readNote } from "@/lib/notes/webdav";
import { prisma } from "@/lib/prisma";

import { extractKeywords } from "./keywords";

const LOG_SOURCE = "ask-retrieve";

export type AskSourceType =
  | "task"
  | "event"
  | "note"
  | "recording"
  | "project"
  | "activity";

export interface AskSource {
  /** 1-based citation marker handed to the model as `[n]`. */
  n: number;
  type: AskSourceType;
  id: string;
  title: string;
  subtitle?: string;
  /** In-app deep link, shown to the user as a consulted resource. */
  url: string;
  /** The text this source contributes to the prompt. */
  content: string;
}

/** Pre-numbering shape; `rank` 2 = keyword hit, 1 = baseline. */
type Candidate = Omit<AskSource, "n"> & { rank: 1 | 2 };

const KEYWORD_TAKE = 20; // per source, keyword-matched (before budget trim)
const BASELINE_TAKE = 12; // per source, recency fallback
const NOTE_READ_LIMIT = Number(process.env.ASK_NOTES_READ_LIMIT || 20);
const NOTE_READ_CONCURRENCY = 6;

/*
 * Context budget. These look stingy, and they are — deliberately. The local
 * Ollama box is CPU-only and evaluates a prompt at roughly 15 tok/s, so every
 * 1000 characters of context costs the user about 25 seconds of staring at a
 * spinner. ~3.8k chars keeps a full answer near two minutes. Raise
 * ASK_MAX_CONTEXT_CHARS if you point ASK_MODEL at faster (e.g. GPU) hardware.
 */
const NOTE_CHARS = 400;
const RECORDING_CHARS = 320;
const TEXT_CHARS = 180; // per-field truncation for descriptions/summaries
/** No single source type may occupy more than this many slots. */
const MAX_PER_TYPE = Number(process.env.ASK_MAX_PER_TYPE || 5);
const MAX_SOURCES = Number(process.env.ASK_MAX_SOURCES || 14);
const MAX_CONTEXT_CHARS = Number(process.env.ASK_MAX_CONTEXT_CHARS || 3_800);

const DAY_MS = 24 * 60 * 60 * 1000;

function fmtDate(d: Date | null | undefined): string | undefined {
  if (!d) return undefined;
  return d.toLocaleString("fr-CA", { dateStyle: "medium", timeStyle: "short" });
}

function fmtDay(d: Date | null | undefined): string | undefined {
  if (!d) return undefined;
  return d.toLocaleDateString("fr-CA", { dateStyle: "medium" });
}

function clip(text: string | null | undefined, max: number): string {
  if (!text) return "";
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

/** Join the non-empty parts of a context line. */
function line(...parts: (string | undefined | null | false)[]): string {
  return parts.filter(Boolean).join(" · ");
}

/**
 * Retrieve and rank everything relevant to `question` for one user.
 * Never throws: a source that fails (WebDAV down, say) is logged and skipped
 * so the answer still gets built from whatever else is reachable.
 */
export async function retrieveSources(
  userId: string,
  question: string
): Promise<AskSource[]> {
  const terms = extractKeywords(question);

  const settled = await Promise.allSettled([
    retrieveTasks(userId, terms),
    retrieveEvents(userId, terms),
    retrieveRecordings(userId, terms),
    retrieveNotes(terms),
    retrieveProjects(userId, terms),
    retrieveActivity(terms),
  ]);

  const candidates: Candidate[] = [];
  for (const result of settled) {
    if (result.status === "fulfilled") {
      candidates.push(...result.value);
    } else {
      logger.error(
        "Ask retrieval source failed",
        {
          error:
            result.reason instanceof Error
              ? result.reason.message
              : String(result.reason),
        },
        LOG_SOURCE
      );
    }
  }

  return numberAndTrim(dedupe(candidates));
}

/** Keyword hits win over baseline entries for the same record. */
function dedupe(candidates: Candidate[]): Candidate[] {
  const byKey = new Map<string, Candidate>();
  for (const c of candidates) {
    const key = `${c.type}:${c.id}`;
    const existing = byKey.get(key);
    if (!existing || c.rank > existing.rank) byKey.set(key, c);
  }
  return [...byKey.values()];
}

/**
 * Interleave round-robin across types within each rank tier, then cut to the
 * per-type, source and char budgets.
 *
 * Both the interleaving and {@link MAX_PER_TYPE} matter: a question about "ma
 * semaine" filename-matches every "Semaine N.md" in the vault, and without a
 * per-type cap those notes alone consume the whole budget and the calendar —
 * the thing actually being asked about — never reaches the model.
 */
function numberAndTrim(candidates: Candidate[]): AskSource[] {
  const ordered: Candidate[] = [];

  for (const rank of [2, 1] as const) {
    const queues = new Map<AskSourceType, Candidate[]>();
    for (const c of candidates.filter((x) => x.rank === rank)) {
      const queue = queues.get(c.type);
      if (queue) queue.push(c);
      else queues.set(c.type, [c]);
    }
    let drained = false;
    while (!drained) {
      drained = true;
      for (const queue of queues.values()) {
        const next = queue.shift();
        if (next) {
          ordered.push(next);
          drained = false;
        }
      }
    }
  }

  const sources: AskSource[] = [];
  const perType = new Map<AskSourceType, number>();
  let used = 0;
  for (const c of ordered) {
    if (sources.length >= MAX_SOURCES) break;
    const taken = perType.get(c.type) ?? 0;
    if (taken >= MAX_PER_TYPE) continue;
    if (used + c.content.length > MAX_CONTEXT_CHARS) continue;
    perType.set(c.type, taken + 1);
    used += c.content.length;
    sources.push({
      n: sources.length + 1,
      type: c.type,
      id: c.id,
      title: c.title,
      subtitle: c.subtitle,
      url: c.url,
      content: c.content,
    });
  }
  return sources;
}

/** Build a Prisma OR clause matching any term against any of `fields`. */
function orContains<F extends string>(terms: string[], fields: F[]) {
  return terms.flatMap((term) =>
    fields.map(
      (field) =>
        ({ [field]: { contains: term, mode: "insensitive" } }) as Record<
          F,
          { contains: string; mode: "insensitive" }
        >
    )
  );
}

async function retrieveTasks(
  userId: string,
  terms: string[]
): Promise<Candidate[]> {
  const select = {
    id: true,
    title: true,
    description: true,
    status: true,
    priority: true,
    dueDate: true,
    completedAt: true,
    project: { select: { name: true } },
  } as const;

  const [matched, open, recentlyDone] = await Promise.all([
    terms.length
      ? prisma.task.findMany({
          where: { userId, OR: orContains(terms, ["title", "description"]) },
          select,
          orderBy: { updatedAt: "desc" },
          take: KEYWORD_TAKE,
        })
      : [],
    prisma.task.findMany({
      where: { userId, status: { not: "completed" } },
      select,
      orderBy: { dueDate: "asc" }, // Postgres sorts NULLs last on ASC
      take: BASELINE_TAKE,
    }),
    prisma.task.findMany({
      where: { userId, status: "completed" },
      select,
      orderBy: { completedAt: "desc" },
      take: 8,
    }),
  ]);

  const toCandidate = (
    t: (typeof matched)[number],
    rank: 1 | 2
  ): Candidate => ({
    rank,
    type: "task",
    id: t.id,
    title: t.title,
    subtitle: line(
      t.status?.replace("_", " "),
      t.dueDate ? `échéance ${fmtDay(t.dueDate)}` : undefined
    ),
    url: "/tasks",
    content: line(
      `TÂCHE « ${t.title} »`,
      `statut ${t.status}`,
      t.priority ? `priorité ${t.priority}` : undefined,
      t.dueDate ? `échéance ${fmtDay(t.dueDate)}` : undefined,
      t.completedAt ? `terminée ${fmtDay(t.completedAt)}` : undefined,
      t.project ? `projet ${t.project.name}` : undefined,
      clip(t.description, TEXT_CHARS) || undefined
    ),
  });

  return [
    ...matched.map((t) => toCandidate(t, 2)),
    ...open.map((t) => toCandidate(t, 1)),
    ...recentlyDone.map((t) => toCandidate(t, 1)),
  ];
}

async function retrieveEvents(
  userId: string,
  terms: string[]
): Promise<Candidate[]> {
  const select = {
    id: true,
    title: true,
    description: true,
    location: true,
    start: true,
    end: true,
    allDay: true,
  } as const;
  const mine = { feed: { userId } };
  const now = new Date();

  const [matched, window] = await Promise.all([
    terms.length
      ? prisma.calendarEvent.findMany({
          where: {
            ...mine,
            OR: orContains(terms, ["title", "description", "location"]),
          },
          select,
          orderBy: { start: "desc" },
          take: KEYWORD_TAKE,
        })
      : [],
    prisma.calendarEvent.findMany({
      where: {
        ...mine,
        start: {
          gte: new Date(now.getTime() - 7 * DAY_MS),
          lte: new Date(now.getTime() + 21 * DAY_MS),
        },
      },
      select,
      orderBy: { start: "asc" },
      take: BASELINE_TAKE + 8,
    }),
  ]);

  const toCandidate = (
    e: (typeof matched)[number],
    rank: 1 | 2
  ): Candidate => ({
    rank,
    type: "event",
    id: e.id,
    title: e.title,
    subtitle: line(e.allDay ? fmtDay(e.start) : fmtDate(e.start), e.location),
    url: "/calendar",
    content: line(
      `ÉVÉNEMENT « ${e.title} »`,
      e.allDay
        ? `${fmtDay(e.start)} (toute la journée)`
        : `${fmtDate(e.start)} → ${fmtDate(e.end)}`,
      e.location ? `lieu ${e.location}` : undefined,
      clip(e.description, TEXT_CHARS) || undefined
    ),
  });

  return [
    ...matched.map((e) => toCandidate(e, 2)),
    ...window.map((e) => toCandidate(e, 1)),
  ];
}

async function retrieveRecordings(
  userId: string,
  terms: string[]
): Promise<Candidate[]> {
  const select = {
    id: true,
    title: true,
    summary: true,
    transcript: true,
    source: true,
    recordedAt: true,
  } as const;

  const [matched, recent] = await Promise.all([
    terms.length
      ? prisma.recording.findMany({
          where: {
            userId,
            OR: orContains(terms, ["title", "summary", "transcript"]),
          },
          select,
          orderBy: { recordedAt: "desc" },
          take: 8,
        })
      : [],
    prisma.recording.findMany({
      where: { userId },
      select,
      orderBy: { recordedAt: "desc" },
      take: 5,
    }),
  ]);

  const toCandidate = (
    r: (typeof matched)[number],
    rank: 1 | 2
  ): Candidate => ({
    rank,
    type: "recording",
    id: r.id,
    title: r.title,
    subtitle: line(fmtDay(r.recordedAt), r.source),
    url: "/notes?tab=recordings",
    content: line(
      `ENREGISTREMENT « ${r.title} »`,
      fmtDay(r.recordedAt),
      // Prefer the summary; fall back to the head of the raw transcript.
      clip(r.summary || r.transcript, RECORDING_CHARS) || undefined
    ),
  });

  return [
    ...matched.map((r) => toCandidate(r, 2)),
    ...recent.map((r) => toCandidate(r, 1)),
  ];
}

async function retrieveProjects(
  userId: string,
  terms: string[]
): Promise<Candidate[]> {
  const select = {
    id: true,
    name: true,
    description: true,
    status: true,
    _count: { select: { tasks: true } },
  } as const;

  const [matched, active] = await Promise.all([
    terms.length
      ? prisma.project.findMany({
          where: { userId, OR: orContains(terms, ["name", "description"]) },
          select,
          take: 10,
        })
      : [],
    prisma.project.findMany({
      where: { userId, status: "active" },
      select,
      orderBy: { updatedAt: "desc" },
      take: 10,
    }),
  ]);

  const toCandidate = (
    p: (typeof matched)[number],
    rank: 1 | 2
  ): Candidate => ({
    rank,
    type: "project",
    id: p.id,
    title: p.name,
    subtitle: `${p._count.tasks} tâches`,
    url: "/tasks",
    content: line(
      `PROJET « ${p.name} »`,
      `statut ${p.status}`,
      `${p._count.tasks} tâches`,
      clip(p.description, TEXT_CHARS) || undefined
    ),
  });

  return [
    ...matched.map((p) => toCandidate(p, 2)),
    ...active.map((p) => toCandidate(p, 1)),
  ];
}

/**
 * The Projets agent-activity feed. Rows are box-wide rather than per-user
 * (same as /api/projets/ask), so no userId filter here.
 */
async function retrieveActivity(terms: string[]): Promise<Candidate[]> {
  const select = {
    id: true,
    summary: true,
    createdAt: true,
    project: { select: { name: true, slug: true } },
  } as const;

  const [matched, recent] = await Promise.all([
    terms.length
      ? prisma.agentActivity.findMany({
          where: { OR: orContains(terms, ["summary"]) },
          select,
          orderBy: { createdAt: "desc" },
          take: KEYWORD_TAKE,
        })
      : [],
    prisma.agentActivity.findMany({
      select,
      orderBy: { createdAt: "desc" },
      take: BASELINE_TAKE,
    }),
  ]);

  const toCandidate = (
    a: (typeof matched)[number],
    rank: 1 | 2
  ): Candidate => ({
    rank,
    type: "activity",
    id: a.id,
    title: clip(a.summary, 80),
    subtitle: line(a.project.name, fmtDay(a.createdAt)),
    url: `/projets/${a.project.slug}`,
    content: line(
      `ACTIVITÉ PROJET [${a.project.name}]`,
      fmtDate(a.createdAt),
      clip(a.summary, TEXT_CHARS)
    ),
  });

  return [
    ...matched.map((a) => toCandidate(a, 2)),
    ...recent.map((a) => toCandidate(a, 1)),
  ];
}

/**
 * Obsidian notes. The vault has no search API, so this reads a bounded slice
 * over WebDAV: every filename-matching note, then the most recently modified
 * ones (kept only if their body mentions a term). Notes outside that slice are
 * invisible to the answer — raise ASK_NOTES_READ_LIMIT to widen it.
 */
async function retrieveNotes(terms: string[]): Promise<Candidate[]> {
  if (!isNotesConfigured()) return [];

  const files = (await listVault()).filter((e) => e.type === "file");
  const lowered = terms.map((t) => t.toLowerCase());
  const hits = (haystack: string) => {
    const l = haystack.toLowerCase();
    return lowered.some((t) => l.includes(t));
  };

  const named = files.filter((f) => hits(f.name)).slice(0, NOTE_READ_LIMIT);
  const namedPaths = new Set(named.map((f) => f.path));
  const recent = files
    .filter((f) => !namedPaths.has(f.path))
    .sort(
      (a, b) =>
        new Date(b.lastModified ?? 0).getTime() -
        new Date(a.lastModified ?? 0).getTime()
    )
    .slice(0, Math.max(0, NOTE_READ_LIMIT - named.length));

  const toRead = [...named, ...recent];
  const bodies = new Map<string, string>();

  for (let i = 0; i < toRead.length; i += NOTE_READ_CONCURRENCY) {
    const batch = toRead.slice(i, i + NOTE_READ_CONCURRENCY);
    const read = await Promise.allSettled(batch.map((f) => readNote(f.path)));
    read.forEach((result, idx) => {
      if (result.status === "fulfilled") {
        bodies.set(batch[idx].path, result.value);
      }
    });
  }

  const candidates: Candidate[] = [];
  for (const file of toRead) {
    const body = bodies.get(file.path);
    if (body === undefined) continue;

    const nameMatched = namedPaths.has(file.path);
    const bodyMatched = terms.length > 0 && hits(body);
    // With no usable keywords, fall back to "the notes touched most recently".
    if (!nameMatched && !bodyMatched && terms.length > 0) continue;

    const title = file.name.replace(/\.(md|markdown|txt|canvas)$/i, "");
    candidates.push({
      rank: nameMatched || bodyMatched ? 2 : 1,
      type: "note",
      id: file.path,
      title,
      subtitle: file.path.replace(/^\//, ""),
      url: `/notes?path=${encodeURIComponent(file.path)}`,
      content: line(
        `NOTE « ${title} » (${file.path})`,
        clip(body, NOTE_CHARS) || "(vide)"
      ),
    });
  }

  // Keep the recency fallback small — it is the least targeted evidence.
  const baseline = candidates.filter((c) => c.rank === 1).slice(0, 5);
  return [...candidates.filter((c) => c.rank === 2), ...baseline];
}
