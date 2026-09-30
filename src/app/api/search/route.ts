import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";
import { isNotesConfigured, listVault } from "@/lib/notes/webdav";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "search-route";

export const dynamic = "force-dynamic";

export interface SearchResult {
  type:
    | "project"
    | "contact"
    | "organisation"
    | "task"
    | "event"
    | "invoice"
    | "note"
    | "recording"
    | "machine"
    | "ghost";
  id: string;
  title: string;
  subtitle?: string;
  url: string;
}

const PER_TYPE = 5;

/**
 * GET /api/search?q=... — unified content search across the app: projects,
 * contacts, organisations, tasks, calendar events, invoices (Fiscalité),
 * Obsidian notes, recordings, machines and ghost blocks. Powers the command
 * palette's content results; each result links to where it lives.
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
    const tag = q.toLowerCase();
    const [tasks, events, recordings, notes, projects, contacts, organisations, invoices, machines, ghosts] = await Promise.all([
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
      prisma.agentProject.findMany({
        where: {
          OR: [{ name: contains }, { slug: contains }, { description: contains }, { stack: { has: q } }],
        },
        select: { name: true, slug: true, archived: true, organisation: { select: { name: true } } },
        orderBy: [{ archived: "asc" }, { lastActivityAt: "desc" }],
        take: PER_TYPE,
      }),
      prisma.contact.findMany({
        where: {
          OR: [
            { name: contains },
            { company: contains },
            { email: contains },
            { phone: contains },
            { role: contains },
            { relationDetail: contains },
            { notes: contains },
            { tags: { has: tag } },
            { labels: { some: { name: contains } } },
            { links: { some: { value: contains } } },
          ],
        },
        select: { id: true, name: true, company: true, role: true },
        orderBy: [{ favorite: "desc" }, { name: "asc" }],
        take: PER_TYPE,
      }),
      prisma.organisation.findMany({
        where: {
          OR: [
            { name: contains },
            { description: contains },
            { taxProfile: { is: { OR: [{ legalName: contains }, { neq: contains }] } } },
          ],
        },
        select: { id: true, name: true, kind: true, _count: { select: { projects: true } } },
        take: PER_TYPE,
      }),
      prisma.invoice.findMany({
        where: {
          OR: [{ party: contains }, { number: contains }, { description: contains }, { notes: contains }],
        },
        select: {
          id: true,
          party: true,
          number: true,
          description: true,
          direction: true,
          date: true,
          totalCents: true,
          organisationId: true,
          organisation: { select: { name: true } },
        },
        orderBy: { date: "desc" },
        take: PER_TYPE,
      }),
      prisma.machine.findMany({
        where: { OR: [{ name: contains }, { label: contains }] },
        select: { id: true, name: true, label: true, kind: true },
        take: PER_TYPE,
      }),
      prisma.routineBlock.findMany({
        where: { title: contains, layer: { userId: auth.userId } },
        select: { id: true, title: true, startTime: true, endTime: true, days: true, layer: { select: { name: true } } },
        take: PER_TYPE,
      }),
    ]);

    const money = (cents: number) =>
      new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD" }).format(cents / 100);
    const results: SearchResult[] = [
      ...projects.map((p) => ({
        type: "project" as const,
        id: p.slug,
        title: p.name,
        subtitle: [p.organisation?.name, p.archived ? "archivé" : null].filter(Boolean).join(" · ") || undefined,
        url: `/projets/${p.slug}`,
      })),
      ...contacts.map((c) => ({
        type: "contact" as const,
        id: c.id,
        title: c.name,
        subtitle: [c.role, c.company].filter(Boolean).join(" · ") || undefined,
        url: `/contacts?q=${encodeURIComponent(c.name)}`,
      })),
      ...organisations.map((o) => ({
        type: "organisation" as const,
        id: o.id,
        title: o.name,
        subtitle: `${o._count.projects} projet${o._count.projects > 1 ? "s" : ""}`,
        url: `/projets?org=${o.id}`,
      })),
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
      ...invoices.map((i) => ({
        type: "invoice" as const,
        id: i.id,
        title: i.party || i.description || (i.number ? `Facture ${i.number}` : "Facture"),
        subtitle: [
          i.organisation.name,
          `${i.direction === "revenu" ? "+" : "−"}${money(i.totalCents)}`,
          i.date.toISOString().slice(0, 10),
        ].join(" · "),
        url: `/fiscalite?org=${i.organisationId}`,
      })),
      ...notes,
      ...machines.map((m) => ({
        type: "machine" as const,
        id: m.id,
        title: m.label || m.name,
        subtitle: m.label ? m.name : m.kind === "vps" ? "VPS" : undefined,
        url: "/machines",
      })),
      ...ghosts.map((g) => ({
        type: "ghost" as const,
        id: g.id,
        title: g.title,
        subtitle: `${g.startTime}–${g.endTime} · ${g.layer.name}`,
        url: "/calendar",
      })),
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
