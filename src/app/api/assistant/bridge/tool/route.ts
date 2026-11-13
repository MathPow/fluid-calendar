import { NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { bridgeTokenOk, getBridgeRun, markToolDone } from "@/lib/assistant/bridge";
import { type ToolOutput, runTool } from "@/lib/assistant/tools";
import { logger } from "@/lib/logger";

const LOG_SOURCE = "assistant-bridge-tool";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const BodySchema = z.object({
  runId: z.string().uuid(),
  name: z.string().min(1).max(100),
  input: z.unknown(),
});

type McpContent =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string };

/** A tool's output in MCP's shape. A scanned PDF can't travel over MCP. */
function toMcp(out: ToolOutput): McpContent[] {
  if (typeof out === "string") return [{ type: "text", text: out }];
  return out.map((b): McpContent => {
    if (b.type === "text") return { type: "text", text: b.text };
    if (b.type === "image" && b.source.type === "base64") {
      return { type: "image", data: b.source.data, mimeType: b.source.media_type };
    }
    return {
      type: "text",
      text: "[PDF scanné : illisible par ce modèle. Suggère d'utiliser un modèle Claude par API.]",
    };
  });
}

/**
 * POST /api/assistant/bridge/tool — the Claude Code bridge on uguiso calling
 * one of the assistant's tools for a live run (see src/lib/assistant/bridge.ts).
 * Bearer CLAUDE_BRIDGE_TOKEN; the run id says whose data it is.
 */
export async function POST(request: NextRequest) {
  if (!bridgeTokenOk(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  const { runId, name, input } = parsed.data;
  const run = getBridgeRun(runId);
  if (!run) return NextResponse.json({ error: "Unknown or finished run" }, { status: 404 });

  try {
    const out = await runTool(run.userId, name, input, run.registry);
    markToolDone(run, name);
    return NextResponse.json({ content: toMcp(out) });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.warn("Assistant tool failed (bridge)", { tool: name, error: msg }, LOG_SOURCE);
    return NextResponse.json({ content: [{ type: "text", text: msg }], isError: true });
  }
}
