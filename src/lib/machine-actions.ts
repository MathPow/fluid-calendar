import { spawn } from "node:child_process";

import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { agentOnline } from "@/lib/desktop-actions";
import { isPromptKind, type LauncherRecurrence } from "@/lib/launchers";

const LOG_SOURCE = "machine-actions";
const OUTPUT_TAIL_LINES = 200;
const OUTPUT_TAIL_BYTES = 20_000;
const AGENT_POLL_MS = 2_000;
const AGENT_TIMEOUT_MS = 20 * 60_000;
const SSH_TIMEOUT_MS = 15 * 60_000;

/** The shell command a prompt shortcut becomes when it lands on a machine. */
function promptCommand(kind: string): string {
  if (kind === "claude-prompt")
    return "claude -p --dangerously-skip-permissions";
  if (kind === "codex-prompt") return "codex exec -s danger-full-access -";
  throw new Error(`Kind non pris en charge : ${kind}`);
}

/** Keep the last N lines and cap at 20 KB so a chatty prompt can't fill up a row. */
function trimOutput(s: string): string {
  const lines = s.split("\n");
  const tail = lines.slice(-OUTPUT_TAIL_LINES).join("\n");
  return tail.length > OUTPUT_TAIL_BYTES
    ? tail.slice(-OUTPUT_TAIL_BYTES)
    : tail;
}

async function writeResult(
  launcherId: string,
  patch: { lastResult?: string | null; lastError?: string | null }
) {
  await prisma.launchShortcut
    .update({
      where: { id: launcherId },
      data: {
        lastRunAt: new Date(),
        lastResult: patch.lastResult ?? null,
        lastError: patch.lastError ?? null,
      },
    })
    .catch((e) =>
      logger.error(
        "failed to write launcher run result",
        { launcherId, err: e instanceof Error ? e.message : String(e) },
        LOG_SOURCE
      )
    );
}

/** Poll the DesktopCommand row until it reaches a final state (or timeout). */
async function waitForDesktopCommand(commandId: string): Promise<{
  status: string;
  output: string | null;
  error: string | null;
}> {
  const deadline = Date.now() + AGENT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, AGENT_POLL_MS));
    const row = await prisma.desktopCommand.findUnique({
      where: { id: commandId },
      select: { status: true, output: true, error: true },
    });
    if (!row) return { status: "failed", output: null, error: "Commande disparue" };
    if (row.status === "done" || row.status === "failed" || row.status === "denied")
      return { status: row.status, output: row.output, error: row.error };
  }
  return { status: "failed", output: null, error: "Délai d'attente dépassé." };
}

/** Run a command over ssh, piping the prompt on stdin so it never hits argv. */
async function runViaSsh(
  launcherId: string,
  machine: {
    host: string | null;
    ip: string | null;
    sshUser: string | null;
    sshKey: string | null;
    name: string;
  },
  kind: string,
  prompt: string
): Promise<string> {
  const target = machine.host || machine.ip;
  const user = machine.sshUser;
  const key = machine.sshKey;
  const runId = `ssh-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  if (!target || !user) {
    await writeResult(launcherId, {
      lastError: `Pas d'adresse ssh sur ${machine.name}.`,
    });
    return runId;
  }
  const remote = promptCommand(kind);
  const args = [
    "-o",
    "BatchMode=yes",
    "-o",
    "StrictHostKeyChecking=accept-new",
    ...(key ? ["-i", key.replace(/^~/, process.env.HOME || "~")] : []),
    `${user}@${target}`,
    "bash",
    "-lc",
    remote,
  ];
  await new Promise<void>((resolve) => {
    let buf = "";
    const child = spawn("ssh", args, {
      stdio: ["pipe", "pipe", "pipe"],
    });
    const keep = (chunk: Buffer) => {
      buf = (buf + chunk.toString()).slice(-OUTPUT_TAIL_BYTES * 2);
    };
    child.stdout.on("data", keep);
    child.stderr.on("data", keep);
    child.stdin.end(prompt);
    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {}
      buf += "\n[arrêté : délai dépassé]";
    }, SSH_TIMEOUT_MS);
    child.on("close", (code) => {
      clearTimeout(timer);
      const trimmed = trimOutput(buf);
      writeResult(launcherId, {
        lastResult: trimmed || null,
        lastError: code === 0 ? null : `Code de sortie ${code}`,
      }).finally(() => resolve());
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      writeResult(launcherId, {
        lastResult: null,
        lastError: e.message,
      }).finally(() => resolve());
    });
  });
  return runId;
}

type LauncherWithMachine = {
  id: string;
  kind: string;
  promptText: string | null;
  machine: {
    id: string;
    name: string;
    host: string | null;
    ip: string | null;
    sshUser: string | null;
    sshKey: string | null;
    agentTokenHash: string | null;
    agentSeenAt: Date | null;
  } | null;
};

/**
 * Fire a prompt shortcut on its machine — through the desktop agent if it's
 * online, else over ssh. Runs in the background; the caller gets a runId
 * right away and the launcher row is updated when the command finishes.
 * Returns null when the launcher isn't runnable (no machine, missing prompt…).
 */
export async function runMachineAction(l: LauncherWithMachine): Promise<
  | { ok: true; runId: string; via: "agent" | "ssh" }
  | { ok: false; error: string }
> {
  if (!isPromptKind(l.kind)) return { ok: false, error: "Kind non pris en charge" };
  if (!l.promptText || !l.promptText.trim())
    return { ok: false, error: "Prompt vide." };
  if (!l.machine) return { ok: false, error: "Aucune machine." };

  const useAgent =
    l.machine.agentTokenHash && agentOnline(l.machine.agentSeenAt);

  if (useAgent) {
    // Queue right away so the caller sees the row instantly; poll in bg.
    const command = await prisma.desktopCommand.create({
      data: {
        machineId: l.machine.id,
        action: "agent_run",
        args: {
          command: promptCommand(l.kind),
          input: l.promptText,
        } as object,
      },
      select: { id: true },
    });
    setImmediate(async () => {
      try {
        const result = await waitForDesktopCommand(command.id);
        await writeResult(l.id, {
          lastResult: result.output ? trimOutput(result.output) : null,
          lastError:
            result.status === "done"
              ? null
              : result.error || `Statut : ${result.status}`,
        });
      } catch (e) {
        await writeResult(l.id, {
          lastError: e instanceof Error ? e.message : String(e),
        });
      }
    });
    return { ok: true, runId: command.id, via: "agent" };
  }

  if (!l.machine.host && !l.machine.ip) {
    return {
      ok: false,
      error: `${l.machine.name} n'a ni agent en ligne ni adresse ssh.`,
    };
  }
  const runId = `pending-${Date.now().toString(36)}`;
  setImmediate(() => {
    runViaSsh(l.id, l.machine!, l.kind, l.promptText!).catch((e) =>
      logger.error(
        "ssh run failed",
        { id: l.id, err: e instanceof Error ? e.message : String(e) },
        LOG_SOURCE
      )
    );
  });
  return { ok: true, runId, via: "ssh" };
}

/** Bump `scheduledFor` forward by one recurrence step. */
function stepDate(d: Date, rec: LauncherRecurrence): Date {
  const next = new Date(d);
  if (rec === "daily") next.setDate(next.getDate() + 1);
  else if (rec === "weekly") next.setDate(next.getDate() + 7);
  else if (rec === "monthly") next.setMonth(next.getMonth() + 1);
  return next;
}

/**
 * Advance a scheduled date past `now`, one recurrence step at a time. When
 * the row has been missed for a while (host was down, no cron) this catches
 * up in a bounded loop and returns the next future occurrence.
 */
export function nextOccurrence(
  scheduledFor: Date,
  recurrence: LauncherRecurrence | null,
  now: Date = new Date()
): Date | null {
  if (!recurrence) return null;
  let next = scheduledFor;
  let safety = 3650; // ten years of daily catchup, plenty
  while (next <= now && safety-- > 0) next = stepDate(next, recurrence);
  return next;
}

