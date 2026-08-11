/**
 * FluidCalendar MCP server.
 *
 * Exposes calendar events + tasks as MCP tools over Streamable HTTP, guarded by
 * a static Bearer token. Talks to the FluidCalendar Postgres directly via
 * Prisma, scoped to a single user, so there's no NextAuth dance — the server is
 * meant to run next to the database and be reached over the network (e.g. by a
 * remote Orka instance) through your existing HTTPS tunnel.
 *
 * Run:  npx tsx src/mcp/server.ts
 *
 * Env:
 *   DATABASE_URL          Postgres connection (same as the app).
 *   FLUID_MCP_TOKEN       Required. Bearer token clients must present.
 *   FLUID_MCP_USER_EMAIL  Email of the FluidCalendar user to act as.
 *   FLUID_MCP_USER_ID     (alt) User id, takes precedence over email.
 *   FLUID_MCP_PORT        Listen port (default 3837).
 *   FLUID_MCP_HOST        Bind address (default 127.0.0.1 — front it with a tunnel).
 *   FLUID_MCP_FEED_NAME   Name of the LOCAL calendar feed to use (default "Orka").
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { PrismaClient } from "@prisma/client";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

// Relative imports on purpose: src/mcp is excluded from tsconfig, so the "@/"
// path alias isn't guaranteed to resolve when this runs standalone under tsx.
// These modules take a Prisma client as an argument rather than importing the
// app's singleton, precisely so they work on both sides.
import { renderMission } from "../lib/sessions/mission";
import { getSegmentRange, searchTranscript } from "../lib/sessions/search";
import {
  buildTimeline,
  formatTimestamp,
  parseTimestamp,
  timelineDuration,
} from "../lib/sessions/timeline";
import { parseTargets } from "../lib/sessions/types";

const TOKEN = process.env.FLUID_MCP_TOKEN ?? "";
const PORT = Number(process.env.FLUID_MCP_PORT ?? 3837);
const HOST = process.env.FLUID_MCP_HOST ?? "127.0.0.1";
const FEED_NAME = process.env.FLUID_MCP_FEED_NAME ?? "Orka";
const USER_EMAIL = process.env.FLUID_MCP_USER_EMAIL ?? "";
const USER_ID_ENV = process.env.FLUID_MCP_USER_ID ?? "";

if (!TOKEN) {
  console.error("[fluid-mcp] FLUID_MCP_TOKEN is required — refusing to start without auth.");
  process.exit(1);
}
if (!USER_EMAIL && !USER_ID_ENV) {
  console.error("[fluid-mcp] Set FLUID_MCP_USER_EMAIL or FLUID_MCP_USER_ID.");
  process.exit(1);
}

const prisma = new PrismaClient();

// --- Scoped lookups (resolved once, cached) ---

let cachedUserId: string | null = null;
async function resolveUserId(): Promise<string> {
  if (cachedUserId) return cachedUserId;
  if (USER_ID_ENV) {
    cachedUserId = USER_ID_ENV;
    return cachedUserId;
  }
  const user = await prisma.user.findUnique({ where: { email: USER_EMAIL } });
  if (!user) throw new Error(`No FluidCalendar user with email "${USER_EMAIL}".`);
  cachedUserId = user.id;
  return cachedUserId;
}

let cachedFeedId: string | null = null;
/** Find or create the LOCAL calendar feed this server writes into. */
async function getLocalFeedId(): Promise<string> {
  if (cachedFeedId) return cachedFeedId;
  const userId = await resolveUserId();
  const existing = await prisma.calendarFeed.findFirst({
    where: { userId, type: "LOCAL", name: FEED_NAME },
  });
  if (existing) {
    cachedFeedId = existing.id;
    return cachedFeedId;
  }
  const created = await prisma.calendarFeed.create({
    data: { name: FEED_NAME, type: "LOCAL", userId, color: "#3b82f6", enabled: true },
  });
  cachedFeedId = created.id;
  return cachedFeedId;
}

// --- Serializers (Date → ISO, trim noise) ---

function event(e: {
  id: string;
  title: string;
  description: string | null;
  start: Date;
  end: Date;
  location: string | null;
  allDay: boolean;
}) {
  return {
    id: e.id,
    title: e.title,
    description: e.description ?? undefined,
    start: e.start.toISOString(),
    end: e.end.toISOString(),
    location: e.location ?? undefined,
    allDay: e.allDay,
  };
}

function task(t: {
  id: string;
  title: string;
  description: string | null;
  status: string;
  dueDate: Date | null;
  priority: string | null;
  duration: number | null;
  completedAt: Date | null;
}) {
  return {
    id: t.id,
    title: t.title,
    description: t.description ?? undefined,
    status: t.status,
    dueDate: t.dueDate?.toISOString(),
    priority: t.priority ?? undefined,
    duration: t.duration ?? undefined,
    completedAt: t.completedAt?.toISOString(),
  };
}

const ok = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
});

// --- Build a fresh MCP server with all tools (stateless: one per request) ---

function buildMcpServer(): McpServer {
  const server = new McpServer(
    { name: "fluid-calendar", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );

  // ----- Calendar -----

  server.registerTool(
    "list_events",
    {
      description:
        "List calendar events in a time window. Returns events the user owns across all their feeds.",
      inputSchema: {
        from: z.string().describe("Start of window, ISO 8601 (e.g. 2026-05-29T00:00:00Z)."),
        to: z.string().describe("End of window, ISO 8601."),
      },
    },
    async ({ from, to }) => {
      const userId = await resolveUserId();
      const rows = await prisma.calendarEvent.findMany({
        where: {
          feed: { userId },
          start: { lt: new Date(to) },
          end: { gt: new Date(from) },
        },
        orderBy: { start: "asc" },
        take: 200,
      });
      return ok(rows.map(event));
    },
  );

  server.registerTool(
    "create_event",
    {
      description: "Create a calendar event in the local FluidCalendar feed.",
      inputSchema: {
        title: z.string(),
        start: z.string().describe("ISO 8601 start datetime."),
        end: z.string().describe("ISO 8601 end datetime."),
        description: z.string().optional(),
        location: z.string().optional(),
        allDay: z.boolean().optional(),
      },
    },
    async ({ title, start, end, description, location, allDay }) => {
      const feedId = await getLocalFeedId();
      const row = await prisma.calendarEvent.create({
        data: {
          feedId,
          title,
          description,
          location,
          start: new Date(start),
          end: new Date(end),
          allDay: allDay ?? false,
        },
      });
      return ok(event(row));
    },
  );

  server.registerTool(
    "update_event",
    {
      description: "Update fields on an existing calendar event by id.",
      inputSchema: {
        id: z.string(),
        title: z.string().optional(),
        start: z.string().optional(),
        end: z.string().optional(),
        description: z.string().optional(),
        location: z.string().optional(),
        allDay: z.boolean().optional(),
      },
    },
    async ({ id, title, start, end, description, location, allDay }) => {
      const userId = await resolveUserId();
      const existing = await prisma.calendarEvent.findUnique({ where: { id }, include: { feed: true } });
      if (!existing || existing.feed.userId !== userId)
        throw new Error("Event not found or not owned by this user.");
      const row = await prisma.calendarEvent.update({
        where: { id },
        data: {
          title,
          description,
          location,
          allDay,
          start: start ? new Date(start) : undefined,
          end: end ? new Date(end) : undefined,
        },
      });
      return ok(event(row));
    },
  );

  server.registerTool(
    "delete_event",
    {
      description: "Delete a calendar event by id.",
      inputSchema: { id: z.string() },
    },
    async ({ id }) => {
      const userId = await resolveUserId();
      const existing = await prisma.calendarEvent.findUnique({ where: { id }, include: { feed: true } });
      if (!existing || existing.feed.userId !== userId)
        throw new Error("Event not found or not owned by this user.");
      await prisma.calendarEvent.delete({ where: { id } });
      return ok({ deleted: id });
    },
  );

  // ----- Tasks (todos) -----

  server.registerTool(
    "list_tasks",
    {
      description: "List the user's tasks, optionally filtered by status.",
      inputSchema: {
        status: z.enum(["todo", "in_progress", "completed"]).optional(),
      },
    },
    async ({ status }) => {
      const userId = await resolveUserId();
      const rows = await prisma.task.findMany({
        where: { userId, ...(status ? { status } : {}) },
        orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
        take: 200,
      });
      return ok(rows.map(task));
    },
  );

  server.registerTool(
    "create_task",
    {
      description: "Create a task (todo).",
      inputSchema: {
        title: z.string(),
        description: z.string().optional(),
        status: z.enum(["todo", "in_progress", "completed"]).optional(),
        dueDate: z.string().optional().describe("ISO 8601 due date."),
        priority: z.enum(["high", "medium", "low", "none"]).optional(),
        duration: z.number().optional().describe("Estimated duration in minutes."),
      },
    },
    async ({ title, description, status, dueDate, priority, duration }) => {
      const userId = await resolveUserId();
      const row = await prisma.task.create({
        data: {
          userId,
          title,
          description,
          status: status ?? "todo",
          priority,
          duration,
          dueDate: dueDate ? new Date(dueDate) : undefined,
        },
      });
      return ok(task(row));
    },
  );

  server.registerTool(
    "update_task",
    {
      description: "Update fields on a task by id.",
      inputSchema: {
        id: z.string(),
        title: z.string().optional(),
        description: z.string().optional(),
        status: z.enum(["todo", "in_progress", "completed"]).optional(),
        dueDate: z.string().optional(),
        priority: z.enum(["high", "medium", "low", "none"]).optional(),
        duration: z.number().optional(),
      },
    },
    async ({ id, title, description, status, dueDate, priority, duration }) => {
      const userId = await resolveUserId();
      const existing = await prisma.task.findUnique({ where: { id } });
      if (!existing || existing.userId !== userId)
        throw new Error("Task not found or not owned by this user.");
      const row = await prisma.task.update({
        where: { id },
        data: {
          title,
          description,
          status,
          priority,
          duration,
          dueDate: dueDate ? new Date(dueDate) : undefined,
          completedAt: status === "completed" ? new Date() : undefined,
        },
      });
      return ok(task(row));
    },
  );

  server.registerTool(
    "complete_task",
    {
      description: "Mark a task as completed.",
      inputSchema: { id: z.string() },
    },
    async ({ id }) => {
      const userId = await resolveUserId();
      const existing = await prisma.task.findUnique({ where: { id } });
      if (!existing || existing.userId !== userId)
        throw new Error("Task not found or not owned by this user.");
      const row = await prisma.task.update({
        where: { id },
        data: { status: "completed", completedAt: new Date(), lastCompletedDate: new Date() },
      });
      return ok(task(row));
    },
  );

  server.registerTool(
    "delete_task",
    {
      description: "Delete a task by id.",
      inputSchema: { id: z.string() },
    },
    async ({ id }) => {
      const userId = await resolveUserId();
      const existing = await prisma.task.findUnique({ where: { id } });
      if (!existing || existing.userId !== userId)
        throw new Error("Task not found or not owned by this user.");
      await prisma.task.delete({ where: { id } });
      return ok({ deleted: id });
    },
  );

  // ----- Work sessions (recorded calls → directed agent work) -----
  //
  // Three-level retrieval, and the descriptions say so on purpose: an agent that
  // doesn't know the transcript is reachable will happily act on the digest
  // alone. list/get_mission are cheap and always safe; get_segment and
  // search_transcript reach into hours of verbatim and are meant to be used
  // often, a few minutes at a time.

  server.registerTool(
    "list_missions",
    {
      description:
        "List work sessions (recorded calls compiled into missions). Start here to find the session id for a call the user mentions.",
      inputSchema: {
        status: z
          .enum(["draft", "processing", "ready", "error"])
          .optional()
          .describe("Filter by status. Only 'ready' sessions have a digest."),
        limit: z.number().int().min(1).max(100).optional(),
      },
    },
    async ({ status, limit }) => {
      const userId = await resolveUserId();
      const rows = await prisma.workSession.findMany({
        where: { userId, ...(status ? { status } : {}) },
        orderBy: { createdAt: "desc" },
        take: limit ?? 25,
        include: { recordings: { select: { durationSec: true } } },
      });
      return ok(
        rows.map((s) => ({
          id: s.id,
          title: s.title,
          status: s.status,
          createdAt: s.createdAt.toISOString(),
          compiledAt: s.compiledAt?.toISOString(),
          audioCount: s.recordings.length,
          totalDuration: formatTimestamp(
            s.recordings.reduce((sum, r) => sum + (r.durationSec ?? 0), 0),
          ),
        })),
      );
    },
  );

  server.registerTool(
    "get_mission",
    {
      description:
        "Full mission for a work session: the user's written brief, the file paths you may change, a timestamped digest of what was decided, and a table of contents of the call. Read this FIRST. It deliberately does NOT contain the transcript — use search_transcript and get_segment to read the actual words.",
      inputSchema: {
        sessionId: z.string().describe("Session id from list_missions."),
      },
    },
    async ({ sessionId }) => {
      const userId = await resolveUserId();
      const s = await prisma.workSession.findUnique({
        where: { id: sessionId },
        include: {
          recordings: {
            orderBy: { orderIndex: "asc" },
            select: { id: true, title: true, orderIndex: true, durationSec: true },
          },
        },
      });
      if (!s || s.userId !== userId)
        throw new Error("Session not found or not owned by this user.");

      const timeline = buildTimeline(s.recordings);
      return {
        content: [
          {
            type: "text" as const,
            text: renderMission({
              id: s.id,
              title: s.title,
              brief: s.brief,
              digest: s.digest,
              toc: s.toc,
              lexicon: s.lexicon,
              language: s.language,
              targets: parseTargets(s.targets),
              timeline,
              totalDurationSec: timelineDuration(timeline),
              createdAt: s.createdAt,
            }),
          },
        ],
      };
    },
  );

  server.registerTool(
    "search_transcript",
    {
      description:
        "Full-text search the verbatim transcript of a work session. Use it whenever a digest bullet is ambiguous, or to find where a topic was discussed. Returns ranked excerpts with timestamps you can then widen with get_segment.",
      inputSchema: {
        sessionId: z.string(),
        query: z
          .string()
          .describe('Search terms. Supports quoted phrases and -exclusions, e.g. \'"trois paliers" pricing\'.'),
        limit: z.number().int().min(1).max(100).optional().describe("Default 15."),
      },
    },
    async ({ sessionId, query, limit }) => {
      const userId = await resolveUserId();
      const s = await prisma.workSession.findUnique({
        where: { id: sessionId },
        select: { userId: true },
      });
      if (!s || s.userId !== userId)
        throw new Error("Session not found or not owned by this user.");

      const hits = await searchTranscript(prisma, sessionId, query, { limit });
      return ok(
        hits.map((h) => ({ timestamp: h.timestamp, text: h.text, source: h.recordingTitle })),
      );
    },
  );

  server.registerTool(
    "get_segment",
    {
      description:
        "Verbatim transcript for a window of a work session's timeline. This is the source of truth — the digest is only an index. Pull the minutes that matter rather than trying to read the whole call.",
      inputSchema: {
        sessionId: z.string(),
        from: z.string().describe('Start, e.g. "1:40:00" or "742" (seconds).'),
        to: z.string().describe('End, e.g. "1:55:00".'),
      },
    },
    async ({ sessionId, from, to }) => {
      const userId = await resolveUserId();
      const s = await prisma.workSession.findUnique({
        where: { id: sessionId },
        select: { userId: true },
      });
      if (!s || s.userId !== userId)
        throw new Error("Session not found or not owned by this user.");

      const fromSec = parseTimestamp(from);
      const toSec = parseTimestamp(to);
      if (fromSec === null || toSec === null)
        throw new Error('from/to must be timestamps like "1:40:00" or seconds.');

      const range = await getSegmentRange(prisma, sessionId, fromSec, toSec);
      const header = range.truncated
        ? "[window truncated — request a narrower range for the rest]\n\n"
        : "";
      return { content: [{ type: "text" as const, text: header + range.text }] };
    },
  );

  return server;
}

// --- HTTP plumbing (stateless Streamable HTTP + Bearer auth) ---

function unauthorized(res: ServerResponse) {
  res.writeHead(401, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32001, message: "Unauthorized" }, id: null }));
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve(undefined);
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

const httpServer = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);

  if (url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (url.pathname !== "/mcp") {
    res.writeHead(404).end("Not found");
    return;
  }

  if (req.headers.authorization !== `Bearer ${TOKEN}`) {
    unauthorized(res);
    return;
  }

  // Stateless: a fresh server + transport per request avoids cross-request
  // session state. POST carries the JSON-RPC; GET/DELETE (SSE/session) are unused.
  if (req.method !== "POST") {
    res.writeHead(405, { "Content-Type": "application/json", Allow: "POST" });
    res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed" }, id: null }));
    return;
  }

  try {
    const body = await readBody(req);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => transport.close());
    const server = buildMcpServer();
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  } catch (err) {
    console.error("[fluid-mcp] request error:", err);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32603, message: "Internal error" }, id: null }));
    }
  }
});

httpServer.listen(PORT, HOST, () => {
  console.log(`[fluid-mcp] listening on http://${HOST}:${PORT}/mcp (user=${USER_ID_ENV || USER_EMAIL}, feed="${FEED_NAME}")`);
});

async function shutdown() {
  await prisma.$disconnect().catch(() => {});
  httpServer.close(() => process.exit(0));
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
