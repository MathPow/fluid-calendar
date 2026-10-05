/**
 * The assistant's tools: read-only lookups across everything DreamDash holds
 * (mail over IMAP, tasks, calendar, Obsidian notes, recordings, contacts).
 *
 * Every item a tool returns carries an in-app `url` (see ./links), and is
 * also recorded in the run's {@link LinkRegistry} so the chat can show it as
 * a clickable card even when the model forgets to link it.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import { retrieveSources } from "@/lib/ask/retrieve";
import { loadAccounts } from "@/lib/mail/account";
import { machineHealth } from "@/lib/machines/health";
import { machineStats } from "@/lib/machines/netdata";
import { getMessage, listMailboxes, listMessages } from "@/lib/mail/imap";
import { isNotesConfigured, readNote } from "@/lib/notes/webdav";
import { prisma } from "@/lib/prisma";

import { USER_TZ, links } from "./links";

export type LinkType =
  | "email"
  | "task"
  | "event"
  | "note"
  | "recording"
  | "project"
  | "activity"
  | "contact"
  | "machine"
  | "web";

export interface LinkItem {
  type: LinkType;
  title: string;
  subtitle?: string;
  url: string;
}

export type LinkRegistry = Map<string, LinkItem>;

const fmt = (d: Date | string | null | undefined) =>
  d
    ? new Date(d).toLocaleString("fr-CA", {
        timeZone: USER_TZ,
        dateStyle: "medium",
        timeStyle: "short",
      })
    : undefined;

const clip = (text: string | null | undefined, max: number) => {
  if (!text) return "";
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
};

/** Day boundary in the user's zone, as a UTC instant. */
function dayStart(ymd: string): Date {
  // Probe the zone's offset at noon that day, then back off to midnight.
  const noonUtc = new Date(`${ymd}T12:00:00Z`);
  const local = new Date(noonUtc.toLocaleString("en-US", { timeZone: USER_TZ }));
  const offsetMs = noonUtc.getTime() - local.getTime();
  return new Date(new Date(`${ymd}T00:00:00Z`).getTime() + offsetMs);
}

const Ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const inputs = {
  search_email: z.object({
    query: z.string().min(1).max(200),
    mailbox: z.string().max(200).optional(),
    limit: z.number().int().min(1).max(30).optional(),
  }),
  recent_email: z.object({
    mailbox: z.string().max(200).optional(),
    limit: z.number().int().min(1).max(30).optional(),
  }),
  read_email: z.object({
    account_id: z.string().min(1),
    mailbox: z.string().min(1),
    uid: z.number().int().positive(),
  }),
  list_mail_folders: z.object({}),
  search_dreamdash: z.object({ query: z.string().min(1).max(300) }),
  list_events: z.object({ start_date: Ymd, end_date: Ymd }),
  list_tasks: z.object({
    query: z.string().max(200).optional(),
    status: z.enum(["open", "completed", "all"]).optional(),
    due_before: Ymd.optional(),
  }),
  read_note: z.object({ path: z.string().min(1).max(500) }),
  search_contacts: z.object({ query: z.string().min(1).max(200) }),
  machines_status: z.object({}),
};

type ToolName = keyof typeof inputs;

export const TOOL_DEFS: Anthropic.Beta.BetaToolUnion[] = [
  {
    name: "search_email",
    description:
      "Search the user's mailboxes (every connected account) for messages whose sender, subject or body contains `query` — e.g. a company name (\"amazon\"), a person, an order number. Returns envelopes, newest first, each with a `url` that opens it. Searches INBOX unless `mailbox` is given (see list_mail_folders). Use one short keyword per call; call again with variants if nothing comes back.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "One keyword or short phrase." },
        mailbox: { type: "string", description: "IMAP folder, default INBOX." },
        limit: { type: "integer", description: "Max results per account (default 10)." },
      },
      required: ["query"],
    },
  },
  {
    name: "recent_email",
    description:
      "List the newest messages across all mail accounts (envelopes only), for questions like \"what came in today?\".",
    input_schema: {
      type: "object",
      properties: {
        mailbox: { type: "string" },
        limit: { type: "integer", description: "Default 15." },
      },
    },
  },
  {
    name: "read_email",
    description:
      "Read the full text of one message found by search_email/recent_email. Does not mark it as read.",
    input_schema: {
      type: "object",
      properties: {
        account_id: { type: "string" },
        mailbox: { type: "string" },
        uid: { type: "integer" },
      },
      required: ["account_id", "mailbox", "uid"],
    },
  },
  {
    name: "list_mail_folders",
    description: "List the IMAP folders of every mail account.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "search_dreamdash",
    description:
      "Keyword search across tasks, calendar events, Obsidian notes, audio recordings (transcripts/summaries), task projects and the Projets agent activity feed. Good first move for anything that isn't mail.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    },
  },
  {
    name: "list_events",
    description:
      "Calendar events between two dates inclusive (YYYY-MM-DD, user's local time).",
    input_schema: {
      type: "object",
      properties: {
        start_date: { type: "string" },
        end_date: { type: "string" },
      },
      required: ["start_date", "end_date"],
    },
  },
  {
    name: "list_tasks",
    description:
      "List to-do tasks, optionally filtered by a title/description keyword, status (open = not completed; default open) and due date.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string" },
        status: { type: "string", enum: ["open", "completed", "all"] },
        due_before: { type: "string", description: "YYYY-MM-DD" },
      },
    },
  },
  {
    name: "read_note",
    description: "Read an Obsidian note by its vault path (from search_dreamdash).",
    input_schema: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
    },
  },
  {
    name: "search_contacts",
    description: "Search the contacts book by name, email, company or tag.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    },
  },
  {
    name: "machines_status",
    description:
      "Live health of the user's computers and servers (Netdata): online/offline, CPU, RAM, disk, temperatures, GPU, uptime, plus an overall level (ok / warn / bad) and what is over threshold.",
    input_schema: { type: "object", properties: {} },
  },
];

/** Short French label shown in the chat while a tool runs. */
export function describeToolCall(name: string, input: unknown): string {
  const i = (input ?? {}) as Record<string, unknown>;
  switch (name) {
    case "search_email":
      return `Recherche dans les courriels : « ${i.query} »`;
    case "recent_email":
      return "Lecture des derniers courriels";
    case "read_email":
      return "Lecture d'un courriel";
    case "list_mail_folders":
      return "Liste des dossiers courriel";
    case "search_dreamdash":
      return `Recherche dans DreamDash : « ${i.query} »`;
    case "list_events":
      return `Calendrier du ${i.start_date} au ${i.end_date}`;
    case "list_tasks":
      return i.query ? `Tâches : « ${i.query} »` : "Liste des tâches";
    case "read_note":
      return `Lecture de la note ${i.path}`;
    case "search_contacts":
      return `Contacts : « ${i.query} »`;
    case "machines_status":
      return "État des machines";
    case "web_search":
      return `Recherche web : « ${i.query} »`;
    default:
      return name;
  }
}

/**
 * Run one tool call. Returns the JSON text handed back to the model; throws
 * on bad input or backend failure (the caller turns that into is_error).
 */
export async function runTool(
  userId: string,
  name: string,
  rawInput: unknown,
  registry: LinkRegistry
): Promise<string> {
  if (!(name in inputs)) throw new Error(`Unknown tool ${name}`);
  const input = inputs[name as ToolName].parse(rawInput);
  const add = (item: LinkItem) => {
    registry.set(item.url, item);
    return item.url;
  };

  switch (name as ToolName) {
    case "search_email":
    case "recent_email": {
      const i = input as z.infer<typeof inputs.search_email> &
        z.infer<typeof inputs.recent_email>;
      const mailbox = i.mailbox || "INBOX";
      const limit = i.limit ?? (name === "recent_email" ? 15 : 10);
      const accounts = await loadAccounts(userId);
      if (accounts.length === 0) return JSON.stringify({ error: "Aucun compte courriel connecté." });
      const settled = await Promise.allSettled(
        accounts.map((a) => listMessages(a.imap, mailbox, limit, i.query))
      );
      const failed: string[] = [];
      const rows = settled.flatMap((r, idx) => {
        const a = accounts[idx];
        if (r.status === "rejected") {
          failed.push(a.email);
          return [];
        }
        return r.value.map((m) => ({ m, a }));
      });
      rows.sort(
        (x, y) =>
          (y.m.date ? Date.parse(y.m.date) : 0) -
          (x.m.date ? Date.parse(x.m.date) : 0)
      );
      const results = rows.slice(0, limit * 2).map(({ m, a }) => {
        const from = m.from[0];
        const sender = from?.name ? `${from.name} <${from.address}>` : from?.address;
        return {
          account_id: a.id,
          account: a.email,
          mailbox,
          uid: m.uid,
          subject: m.subject,
          from: sender,
          date: fmt(m.date),
          unread: !m.seen,
          attachments: m.hasAttachments || undefined,
          url: add({
            type: "email",
            title: m.subject,
            subtitle: [from?.name || from?.address, fmt(m.date)].filter(Boolean).join(" · "),
            url: links.email(a.id, mailbox, m.uid),
          }),
        };
      });
      return JSON.stringify({ results, ...(failed.length ? { unreachable: failed } : {}) });
    }

    case "read_email": {
      const i = input as z.infer<typeof inputs.read_email>;
      const [account] = await loadAccounts(userId, [i.account_id]);
      if (!account) throw new Error("Compte courriel introuvable");
      const msg = await getMessage(account.imap, i.mailbox, i.uid, false);
      if (!msg) throw new Error("Courriel introuvable");
      const body =
        msg.text ||
        (msg.html ? msg.html.replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ") : "");
      return JSON.stringify({
        subject: msg.subject,
        from: msg.from,
        to: msg.to,
        cc: msg.cc,
        date: fmt(msg.date),
        attachments: msg.attachments.map((a) => a.filename),
        body: clip(body, 8000),
        url: add({
          type: "email",
          title: msg.subject,
          subtitle: [msg.from[0]?.name || msg.from[0]?.address, fmt(msg.date)].filter(Boolean).join(" · "),
          url: links.email(account.id, i.mailbox, i.uid),
        }),
      });
    }

    case "list_mail_folders": {
      const accounts = await loadAccounts(userId);
      const settled = await Promise.allSettled(accounts.map((a) => listMailboxes(a.imap)));
      return JSON.stringify(
        accounts.map((a, idx) => ({
          account: a.email,
          folders: settled[idx].status === "fulfilled" ? settled[idx].value : "unreachable",
        }))
      );
    }

    case "search_dreamdash": {
      const i = input as z.infer<typeof inputs.search_dreamdash>;
      const sources = await retrieveSources(userId, i.query);
      return JSON.stringify(
        sources.map((s) => ({
          type: s.type,
          title: s.title,
          content: s.content,
          url: add({ type: s.type, title: s.title, subtitle: s.subtitle, url: s.url }),
        }))
      );
    }

    case "list_events": {
      const i = input as z.infer<typeof inputs.list_events>;
      const from = dayStart(i.start_date);
      const to = new Date(dayStart(i.end_date).getTime() + 24 * 3600 * 1000);
      const events = await prisma.calendarEvent.findMany({
        where: { feed: { userId }, start: { lt: to }, end: { gt: from } },
        select: {
          id: true,
          title: true,
          start: true,
          end: true,
          allDay: true,
          location: true,
          description: true,
          feed: { select: { name: true } },
        },
        orderBy: { start: "asc" },
        take: 80,
      });
      return JSON.stringify(
        events.map((e) => ({
          title: e.title,
          start: e.allDay ? `${e.start.toISOString().slice(0, 10)} (journée)` : fmt(e.start),
          end: e.allDay ? undefined : fmt(e.end),
          location: e.location || undefined,
          calendar: e.feed.name,
          description: clip(e.description, 200) || undefined,
          url: add({
            type: "event",
            title: e.title,
            subtitle: [fmt(e.start), e.location].filter(Boolean).join(" · "),
            url: links.event(e.start),
          }),
        }))
      );
    }

    case "list_tasks": {
      const i = input as z.infer<typeof inputs.list_tasks>;
      const status = i.status ?? "open";
      const tasks = await prisma.task.findMany({
        where: {
          userId,
          ...(status === "open" ? { status: { not: "completed" } } : {}),
          ...(status === "completed" ? { status: "completed" } : {}),
          ...(i.due_before ? { dueDate: { lt: dayStart(i.due_before) } } : {}),
          ...(i.query
            ? {
                OR: [
                  { title: { contains: i.query, mode: "insensitive" as const } },
                  { description: { contains: i.query, mode: "insensitive" as const } },
                ],
              }
            : {}),
        },
        select: {
          id: true,
          title: true,
          status: true,
          priority: true,
          dueDate: true,
          completedAt: true,
          description: true,
          project: { select: { name: true } },
        },
        orderBy: status === "completed" ? { completedAt: "desc" } : { dueDate: "asc" },
        take: 50,
      });
      return JSON.stringify(
        tasks.map((t) => ({
          title: t.title,
          status: t.status,
          priority: t.priority || undefined,
          due: fmt(t.dueDate),
          completed: fmt(t.completedAt),
          project: t.project?.name,
          description: clip(t.description, 200) || undefined,
          url: add({
            type: "task",
            title: t.title,
            subtitle: [t.status, t.dueDate ? `échéance ${fmt(t.dueDate)}` : undefined]
              .filter(Boolean)
              .join(" · "),
            url: links.task(t.id),
          }),
        }))
      );
    }

    case "read_note": {
      const i = input as z.infer<typeof inputs.read_note>;
      if (!isNotesConfigured()) throw new Error("Le coffre de notes n'est pas configuré");
      const content = await readNote(i.path);
      const title = i.path.split("/").pop()?.replace(/\.(md|markdown|txt)$/i, "") || i.path;
      return JSON.stringify({
        path: i.path,
        content: clip(content, 12000),
        url: add({ type: "note", title, subtitle: i.path, url: links.note(i.path) }),
      });
    }

    case "machines_status": {
      const machines = await prisma.machine.findMany({
        select: { name: true, label: true, kind: true, host: true, notes: true, statsUrl: true, agentSeenAt: true },
        orderBy: { name: "asc" },
      });
      return JSON.stringify(
        await Promise.all(
          machines.map(async (m) => {
            const stats = m.statsUrl ? await machineStats(m.statsUrl) : null;
            const { health, issues } = machineHealth(stats);
            const name = m.label || m.name;
            return {
              name,
              kind: m.kind,
              host: m.host || undefined,
              health,
              issues,
              stats,
              agent_last_seen: fmt(m.agentSeenAt),
              notes: clip(m.notes, 200) || undefined,
              url: add({
                type: "machine",
                title: name,
                subtitle: issues.length ? `${health} · ${issues.map((i) => i.metric).join(", ")}` : health,
                url: "/machines",
              }),
            };
          })
        )
      );
    }

    case "search_contacts": {
      const i = input as z.infer<typeof inputs.search_contacts>;
      const q = { contains: i.query, mode: "insensitive" as const };
      const contacts = await prisma.contact.findMany({
        where: {
          OR: [
            { name: q },
            { email: q },
            { company: q },
            { relationDetail: q },
            { tags: { has: i.query.toLowerCase() } },
          ],
        },
        select: {
          name: true,
          email: true,
          phone: true,
          company: true,
          role: true,
          relation: true,
          relationDetail: true,
          notes: true,
        },
        take: 20,
      });
      return JSON.stringify(
        contacts.map((c) => ({
          ...c,
          notes: clip(c.notes, 300) || undefined,
          url: add({
            type: "contact",
            title: c.name,
            subtitle: [c.company, c.email].filter(Boolean).join(" · "),
            url: links.contact(c.name),
          }),
        }))
      );
    }
  }
}
