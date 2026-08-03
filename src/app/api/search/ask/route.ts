import { NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { answerFromSources } from "@/lib/ask/answer";
import { retrieveSources } from "@/lib/ask/retrieve";
import { authenticateRequest } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";

const LOG_SOURCE = "search-ask";

// Calls the local LLM (slow, CPU-bound); keep on the Node runtime, never cache.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  question: z.string().min(2).max(500),
  /**
   * Skip the LLM and return only the retrieved resources. Retrieval takes
   * ~200ms while a full answer takes minutes on CPU, so the UI asks for these
   * first and renders them while the answer is still generating.
   */
  sourcesOnly: z.boolean().optional(),
});

export interface AskSourceDto {
  n: number;
  type: string;
  id: string;
  title: string;
  subtitle?: string;
  url: string;
  snippet: string;
  /** True when the answer references this source as `[n]`. */
  cited: boolean;
}

export interface AskResponse {
  /** Empty when the request asked for sources only. */
  answer: string;
  sources: AskSourceDto[];
}

function toDto(
  sources: Awaited<ReturnType<typeof retrieveSources>>,
  citedNumbers: Set<number>
): AskSourceDto[] {
  return sources.map((s) => ({
    n: s.n,
    type: s.type,
    id: s.id,
    title: s.title,
    subtitle: s.subtitle,
    url: s.url,
    snippet: s.content.slice(0, 180),
    cited: citedNumbers.has(s.n),
  }));
}

/**
 * POST /api/search/ask — answer a natural-language question or statement using
 * everything the user has in DreamDash (tasks, calendar, notes, recordings,
 * projects, agent activity), returning the answer plus the resources consulted.
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

  const { question, sourcesOnly } = parsed.data;

  try {
    const sources = await retrieveSources(auth.userId, question);

    if (sourcesOnly) {
      return NextResponse.json({
        answer: "",
        sources: toDto(sources, new Set()),
      } satisfies AskResponse);
    }

    const answer = await answerFromSources(question, sources);

    // Surface which sources the model actually leaned on, so the UI can rank
    // the cited ones first while still listing everything that was consulted.
    const citedNumbers = new Set(
      [...answer.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1]))
    );

    return NextResponse.json({
      answer,
      sources: toDto(sources, citedNumbers),
    } satisfies AskResponse);
  } catch (error) {
    logger.error(
      "Failed to answer search question",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Impossible d'obtenir une réponse. Réessaie." },
      { status: 500 }
    );
  }
}
