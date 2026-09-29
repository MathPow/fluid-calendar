import { NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { TrelloTaskProvider } from "@/lib/task-sync/providers/trello-provider";
import {
  UnknownOrganisationError,
  providerOrganisation,
  publicProvider,
  resolveOrganisationId,
} from "@/lib/task-sync/public-provider";

const LOG_SOURCE = "task-sync-trello-connect";

const connectSchema = z.object({
  name: z.string().trim().min(1).max(100),
  key: z.string().trim().min(1),
  token: z.string().trim().min(1),
  /** The organisation this Trello works for. Optional. */
  organisationId: z.string().nullable().optional(),
});

/**
 * POST /api/task-sync/trello/connect
 * Validate a Trello API key + token pair and create a Trello task provider.
 * Boards then show up as task lists to map onto projects.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) return auth.response;

    const body = await request.json();
    const { name, key, token, organisationId } = connectSchema.parse(body);

    const instance = new TrelloTaskProvider({ key, token });
    let me: { id: string; username: string; fullName: string };
    try {
      me = await instance.whoAmI();
    } catch {
      return NextResponse.json(
        {
          error:
            "Trello refused this key/token pair. Check the API key and generate a fresh token with read,write scope.",
        },
        { status: 400 }
      );
    }

    const provider = await prisma.taskProvider.create({
      data: {
        name,
        type: "TRELLO",
        userId: auth.userId,
        syncEnabled: true,
        organisationId: await resolveOrganisationId(prisma, organisationId),
        settings: {
          key,
          token,
          memberId: me.id,
          username: me.username,
          fullName: me.fullName,
        },
      },
      include: providerOrganisation,
    });

    return NextResponse.json(
      { provider: publicProvider(provider) },
      { status: 201 }
    );
  } catch (error) {
    logger.error(
      "Failed to connect Trello provider",
      { error: error instanceof Error ? error.message : "Unknown error" },
      LOG_SOURCE
    );

    if (error instanceof UnknownOrganisationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request", details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Failed to connect Trello provider" },
      { status: 500 }
    );
  }
}
