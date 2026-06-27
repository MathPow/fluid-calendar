import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "voice-command";

const OLLAMA_URL = process.env.OLLAMA_URL || "http://100.88.98.44:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "qwen2.5:3b";
const OLLAMA_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS || 5 * 60 * 1000);

export type CommandAction =
  | "create_task"
  | "create_event"
  | "create_note"
  | "unknown";

export interface CommandIntent {
  action: CommandAction;
  /** Task title / event title / note line. */
  title?: string;
  /** ISO date (YYYY-MM-DD) if a task due date was spoken, else null. */
  due?: string | null;
  priority?: "high" | "medium" | "low" | null;
  /** create_event: ISO 8601 datetime for the event start. */
  start?: string | null;
  /** create_event: ISO 8601 datetime for the event end (defaults to +1h). */
  end?: string | null;
  allDay?: boolean;
}

const LOCAL_FEED_NAME = process.env.VOICE_FEED_NAME || "DreamDash";
let cachedFeedId: string | null = null;

/** Find or create the LOCAL calendar feed that voice-created events land in. */
async function getOrCreateLocalFeed(userId: string): Promise<string> {
  if (cachedFeedId) return cachedFeedId;
  const existing = await prisma.calendarFeed.findFirst({
    where: { userId, type: "LOCAL", name: LOCAL_FEED_NAME },
  });
  if (existing) return (cachedFeedId = existing.id);
  const created = await prisma.calendarFeed.create({
    data: {
      name: LOCAL_FEED_NAME,
      type: "LOCAL",
      userId,
      color: "hsl(6 100% 68%)",
      enabled: true,
    },
  });
  return (cachedFeedId = created.id);
}

export interface CommandResult {
  action: CommandAction;
  ok: boolean;
  message: string;
  taskId?: string;
  eventId?: string;
}

/**
 * Turn a spoken command into a structured intent using the local LLM (Ollama,
 * JSON mode). `todayIso` anchors relative dates like "tomorrow"/"Friday".
 */
export async function interpretCommand(
  transcript: string,
  nowIso: string
): Promise<CommandIntent> {
  const prompt = [
    "You convert a short spoken command for a personal productivity dashboard into JSON.",
    `The current date and time is ${nowIso}. Resolve relative dates/times against it.`,
    "Respond with ONLY a JSON object, no prose, matching this schema:",
    `{"action": "create_task" | "create_event" | "create_note" | "unknown",`,
    ` "title": string,            // the task / event / note text`,
    ` "due": string | null,       // create_task: ISO date YYYY-MM-DD if a due date is mentioned, else null`,
    ` "priority": "high" | "medium" | "low" | null,`,
    ` "start": string | null,     // create_event: ISO 8601 datetime of the event start`,
    ` "end": string | null,       // create_event: ISO 8601 datetime of the event end (else null = +1h)`,
    ` "allDay": boolean}`,
    'Pick create_event when a meeting/appointment at a time is described ("meeting friday at 3pm").',
    'Pick create_task for to-dos/reminders ("remind me to call the bank tomorrow").',
    'Pick create_note to capture a fact ("note that the wifi password is hunter2").',
    'Use "unknown" if it is not a clear actionable command.',
    "Keep the title concise. Preserve the command's language.",
    `\nCommand: "${transcript.replace(/"/g, "'")}"`,
  ].join("\n");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt,
        stream: false,
        format: "json", // force valid JSON output
        options: { temperature: 0 },
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Ollama HTTP ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = (await res.json()) as { response?: string };
  const raw = (data.response ?? "").trim();
  let parsed: CommandIntent;
  try {
    parsed = JSON.parse(raw) as CommandIntent;
  } catch {
    logger.warn("Voice command: non-JSON model output", { raw }, LOG_SOURCE);
    return { action: "unknown" };
  }

  const known: CommandAction[] = ["create_task", "create_event", "create_note"];
  const action: CommandAction = known.includes(parsed.action as CommandAction)
    ? (parsed.action as CommandAction)
    : "unknown";
  return {
    action,
    title: typeof parsed.title === "string" ? parsed.title.trim() : undefined,
    due: parsed.due ?? null,
    priority: parsed.priority ?? null,
    start: parsed.start ?? null,
    end: parsed.end ?? null,
    allDay: Boolean(parsed.allDay),
  };
}

/** Execute a parsed intent against the user's data. */
export async function executeCommand(
  userId: string,
  intent: CommandIntent
): Promise<CommandResult> {
  if (intent.action === "create_task") {
    if (!intent.title) {
      return { action: intent.action, ok: false, message: "No task text understood." };
    }
    const dueDate = intent.due ? new Date(intent.due) : null;
    const task = await prisma.task.create({
      data: {
        userId,
        title: intent.title,
        status: "todo",
        priority: intent.priority ?? null,
        dueDate: dueDate && !Number.isNaN(dueDate.getTime()) ? dueDate : null,
        source: "voice",
      },
      select: { id: true, title: true },
    });
    const when = intent.due ? ` (due ${intent.due})` : "";
    return {
      action: intent.action,
      ok: true,
      taskId: task.id,
      message: `Added task: ${task.title}${when}`,
    };
  }

  if (intent.action === "create_event") {
    if (!intent.title || !intent.start) {
      return {
        action: intent.action,
        ok: false,
        message: "Need an event title and a time.",
      };
    }
    const start = new Date(intent.start);
    if (Number.isNaN(start.getTime())) {
      return { action: intent.action, ok: false, message: "Couldn't parse the event time." };
    }
    const end =
      intent.end && !Number.isNaN(new Date(intent.end).getTime())
        ? new Date(intent.end)
        : new Date(start.getTime() + 60 * 60 * 1000);
    const feedId = await getOrCreateLocalFeed(userId);
    const ev = await prisma.calendarEvent.create({
      data: {
        feedId,
        title: intent.title,
        start,
        end,
        allDay: intent.allDay ?? false,
      },
      select: { id: true, title: true },
    });
    return {
      action: intent.action,
      ok: true,
      eventId: ev.id,
      message: `Added event: ${ev.title} — ${start.toLocaleString()}`,
    };
  }

  if (intent.action === "create_note") {
    // The Obsidian vault is read-only over WebDAV, so a "note" is stored as a
    // task in a lightweight way until note-writing exists. Still useful capture.
    if (!intent.title) {
      return { action: intent.action, ok: false, message: "No note text understood." };
    }
    const task = await prisma.task.create({
      data: { userId, title: intent.title, status: "todo", source: "voice-note" },
      select: { id: true, title: true },
    });
    return {
      action: intent.action,
      ok: true,
      taskId: task.id,
      message: `Captured note as task: ${task.title}`,
    };
  }

  return {
    action: "unknown",
    ok: false,
    message: "Sorry, I didn't catch an actionable command.",
  };
}
