import { NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { runAssistant } from "@/lib/assistant/agent";
import { authenticateRequest } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";

const LOG_SOURCE = "assistant-chat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A deep search can take several tool round-trips.
export const maxDuration = 300;

const BodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(20_000),
      })
    )
    .min(1)
    .max(40),
  context: z.object({
    path: z.string().max(500),
    title: z.string().max(300).optional(),
    focus: z.string().max(1000).nullable().optional(),
  }),
});

/**
 * POST /api/assistant/chat — the mascot chat. Streams newline-delimited JSON
 * events (status / thinking / text / links / error / done); see
 * src/lib/assistant/agent.ts.
 */
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { messages, context } = parsed.data;
  if (messages[messages.length - 1].role !== "user") {
    return NextResponse.json({ error: "Last message must be from the user" }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: unknown) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      try {
        for await (const event of runAssistant(auth.userId, messages, context)) {
          if (request.signal.aborted) break;
          send(event);
        }
      } catch (error) {
        logger.error(
          "Assistant run failed",
          { error: error instanceof Error ? error.message : String(error) },
          LOG_SOURCE
        );
        send({ type: "error", text: "Oups, je n'ai pas pu terminer. Réessaie." });
        send({ type: "done" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(body, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
    },
  });
}
