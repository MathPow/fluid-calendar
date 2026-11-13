/**
 * The assistant on the Claude subscription: instead of calling the API, hand
 * the conversation to the Claude Code bridge on uguiso (~/services/claude-bridge),
 * which runs `claude -p` logged in to the user's claude.ai account.
 *
 * The model still uses DreamDash's own tools: the bridge exposes them to
 * Claude Code as an MCP server whose calls come back here, to
 * POST /api/assistant/bridge/tool, under a one-off run id tied to the user.
 *
 *   app ──POST /run (NDJSON stream)──▶ bridge ──▶ claude -p
 *   app ◀──POST /bridge/tool {runId}── bridge ◀── MCP tool call
 */
import { randomUUID } from "node:crypto";

import { logger } from "@/lib/logger";

import { INVOICE_WRITE_TOOLS, type LinkRegistry, TOOL_DEFS, describeToolCall } from "./tools";

const LOG_SOURCE = "assistant-bridge";

/** Prefix Claude Code gives the tools of our MCP server (server name "dd"). */
const MCP_PREFIX = "mcp__dd__";

export const bridgeConfigured = () =>
  !!process.env.CLAUDE_BRIDGE_URL && !!process.env.CLAUDE_BRIDGE_TOKEN;

/** Where the bridge calls the tools back; the app's public URL by default. */
const callbackBase = () =>
  (process.env.CLAUDE_BRIDGE_CALLBACK_URL || process.env.NEXTAUTH_URL || "").replace(/\/$/, "");

export interface BridgeRun {
  userId: string;
  registry: LinkRegistry;
  invoicesChanged: boolean;
}

/** Live runs, by id. One container, so memory is enough. */
const runs = new Map<string, BridgeRun>();

export const getBridgeRun = (runId: string) => runs.get(runId);

/** Same check both ways: the app calls the bridge, the bridge calls back. */
export function bridgeTokenOk(header: string | null): boolean {
  const token = process.env.CLAUDE_BRIDGE_TOKEN;
  return !!token && header === `Bearer ${token}`;
}

export function markToolDone(run: BridgeRun, name: string) {
  if (INVOICE_WRITE_TOOLS.has(name)) run.invoicesChanged = true;
}

type BridgeLine =
  | { type: "text"; text: string }
  | { type: "thinking"; text: string }
  | { type: "tool"; name: string; input: unknown }
  | { type: "error"; text: string }
  | { type: "done" };

export type BridgeEvent =
  | { type: "status"; text: string }
  | { type: "thinking"; text: string }
  | { type: "text"; text: string }
  | { type: "invoices_changed" }
  | { type: "error"; text: string };

/** The tools in the shape the bridge hands to its MCP server. */
function toolList() {
  return TOOL_DEFS.flatMap((t) =>
    "input_schema" in t && "name" in t
      ? [{ name: t.name, description: t.description ?? "", input_schema: t.input_schema }]
      : []
  );
}

/**
 * Runs one assistant turn through the bridge. `registry` collects the links
 * the tools return, same as the API path. Text arrives as it is written.
 */
export async function* runViaBridge(
  userId: string,
  system: string,
  prompt: string,
  registry: LinkRegistry
): AsyncGenerator<BridgeEvent> {
  const runId = randomUUID();
  const run: BridgeRun = { userId, registry, invoicesChanged: false };
  runs.set(runId, run);
  const abort = new AbortController();

  try {
    const res = await fetch(`${process.env.CLAUDE_BRIDGE_URL!.replace(/\/$/, "")}/run`, {
      method: "POST",
      signal: abort.signal,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${process.env.CLAUDE_BRIDGE_TOKEN}`,
      },
      body: JSON.stringify({
        system,
        prompt,
        tools: toolList(),
        callback: { url: `${callbackBase()}/api/assistant/bridge/tool`, runId },
      }),
    });
    if (!res.ok || !res.body) {
      throw new Error(`Bridge HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }

    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = "";
    let wrote = false;
    let afterTool = false;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += value;
      let nl: number;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line) continue;
        let ev: BridgeLine;
        try {
          ev = JSON.parse(line);
        } catch {
          continue;
        }
        if (ev.type === "text") {
          // Keep the text of successive turns apart.
          if (afterTool && wrote) yield { type: "text", text: "\n\n" };
          afterTool = false;
          wrote = true;
          yield { type: "text", text: ev.text };
        } else if (ev.type === "thinking") {
          yield { type: "thinking", text: ev.text };
        } else if (ev.type === "tool") {
          afterTool = true;
          const name = ev.name.startsWith(MCP_PREFIX)
            ? ev.name.slice(MCP_PREFIX.length)
            : ev.name === "WebSearch"
              ? "web_search"
              : ev.name;
          yield { type: "status", text: describeToolCall(name, ev.input) };
        } else if (ev.type === "error") {
          yield { type: "error", text: ev.text };
        } else if (ev.type === "done") {
          break;
        }
      }
    }
    if (run.invoicesChanged) yield { type: "invoices_changed" };
  } catch (error) {
    if (abort.signal.aborted) return;
    logger.error(
      "Claude Code bridge failed",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    throw error;
  } finally {
    // The chat closed or the run ended: stop claude -p and forget the run.
    abort.abort();
    runs.delete(runId);
  }
}
