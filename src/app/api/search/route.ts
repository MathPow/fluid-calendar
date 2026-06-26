import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";
import { isNotesConfigured, listVault } from "@/lib/notes/webdav";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "search-route";

export const dynamic = "force-dynamic";

export interface SearchResult {
  type: "task" | "event" | "note" | "recording";
  id: string;
  title: string;
  subtitle?: string;
  url: string;
}

const PER_TYPE = 5;

/**
 * GET /api/search?q=... — unified content search across the app (tasks,
 * calendar events, Obsidian notes, recordings) for the signed-in user. Powers
 * the command palette's content results.
 */
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;

  const q = (request.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const contains = { contains: q, mode: "insensitive" as const };

  try {
    const [tasks, events, recordings, notes] = await Promise.all([
      prisma.task.findMany({
        where: {
          userId: auth.userId,
          OR: [{ title: contains }, { description: contains }],
        },
        select: { id: true, title: true, status: true },
        take: PER_TYPE,
      }),
      prisma.calendarEvent.findMany({
        where: {
          feed: { userId: auth.userId },
          OR: [
            { title: contains },
            { description: contains },
            { location: contains },
          ],
        },
        select: { id: true, title: true, start: true, location: true },
        orderBy: { start: "desc" },
        take: PER_TYPE,
      }),
      prisma.recording.findMany({
        where: {
          userId: auth.userId,
          OR: [
            { title: contains },
            { transcript: contains },
            { summary: contains },
          ],
        },
        select: { id: true, title: true, recordedAt: true, source: true },
        orderBy: { recordedAt: "desc" },
        take: PER_TYPE,
      }),
      searchNotes(q),
    ]);

    const results: SearchResult[] = [
      ...tasks.map((t) => ({
        type: "task" as const,
        id: t.id,
        title: t.title,
        subtitle: t.status?.replace("_", " "),
        url: "/tasks",
      })),
      ...events.map((e) => ({
        type: "event" as const,
        id: e.id,
        title: e.title,
        subtitle:
          [e.location, e.start ? new Date(e.start).toLocaleDateString() : null]
            .filter(Boolean)
            .join(" · ") || undefined,
        url: "/calendar",
      })),
      ...recordings.map((r) => ({
        type: "recording" as const,
        id: r.id,
        title: r.title,
        subtitle: r.source,
        url: "/notes",
      })),
      ...notes,
    ];

    return NextResponse.json({ results });
  } catch (error) {
    logger.error(
      "Search failed",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}

/** Match Obsidian notes by filename (vault listing is already cached/cheap). */
async function searchNotes(q: string): Promise<SearchResult[]> {
  if (!isNotesConfigured()) return [];
  try {
    const lower = q.toLowerCase();
    const entries = await listVault();
    return entries
      .filter((e) => e.type === "file" && e.name.toLowerCase().includes(lower))
      .slice(0, PER_TYPE)
      .map((e) => ({
        type: "note" as const,
        id: e.path,
        title: e.name.replace(/\.(md|markdown|txt|canvas)$/i, ""),
        subtitle: e.path.replace(/^\//, ""),
        url: `/notes?path=${encodeURIComponent(e.path)}`,
      }));
  } catch {
    return [];
  }
}
