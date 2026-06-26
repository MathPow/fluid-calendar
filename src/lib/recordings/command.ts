import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "voice-command";

const OLLAMA_URL = process.env.OLLAMA_URL || "http://100.88.98.44:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "qwen2.5:3b";
const OLLAMA_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS || 5 * 60 * 1000);

export type CommandAction = "create_task" | "create_note" | "unknown";

export interface CommandIntent {
  action: CommandAction;
  /** Task title / note line. */
  title?: string;
  /** ISO date (YYYY-MM-DD) if a due date was spoken, else null. */
  due?: string | null;
  priority?: "high" | "medium" | "low" | null;
}

export interface CommandResult {
  action: CommandAction;
  ok: boolean;
  message: string;
  taskId?: string;
}

/**
 * Turn a spoken command into a structured intent using the local LLM (Ollama,
 * JSON mode). `todayIso` anchors relative dates like "tomorrow"/"Friday".
 */
export async function interpretCommand(
  transcript: string,
  todayIso: string
): Promise<CommandIntent> {
  const prompt = [
    "You convert a short spoken command for a personal productivity dashboard into JSON.",
    `Today is ${todayIso}.`,
    "Respond with ONLY a JSON object, no prose, matching this schema:",
    `{"action": "create_task" | "create_note" | "unknown",`,
    ` "title": string,            // the task text or note text`,
    ` "due": string | null,       // ISO date YYYY-MM-DD if a due date is mentioned, resolved against today; else null`,
    ` "priority": "high" | "medium" | "low" | null}`,
    'Examples: "remind me to call the bank tomorrow" -> create_task with title "Call the bank" and due = tomorrow.',
    '"add a note that the wifi password is hunter2" -> create_note with title "The wifi password is hunter2".',
    "If it is not a clear actionable command, use action \"unknown\".",
    "Keep the title concise and imperative. Preserve the command's language.",
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

  const action: CommandAction =
    parsed.action === "create_task" || parsed.action === "create_note"
      ? parsed.action
      : "unknown";
  return {
    action,
    title: typeof parsed.title === "string" ? parsed.title.trim() : undefined,
    due: parsed.due ?? null,
    priority: parsed.priority ?? null,
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
