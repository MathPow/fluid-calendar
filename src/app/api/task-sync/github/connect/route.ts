import { NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { GitHubTaskProvider } from "@/lib/task-sync/providers/github-provider";

const LOG_SOURCE = "task-sync-github-connect";

const connectSchema = z.object({
  name: z.string().min(1).max(100),
  token: z.string().min(1),
  login: z.string().min(1),
  ownerType: z.enum(["user", "organization"]),
});

/**
 * POST /api/task-sync/github/connect
 * Validate a GitHub PAT and create a GitHub task provider
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) return auth.response;

    const userId = auth.userId;
    const body = await request.json();
    const { name, token, login, ownerType } = connectSchema.parse(body);

    // Validate the token against the GitHub API
    const providerInstance = new GitHubTaskProvider({ token, login, ownerType });
    const isValid = await providerInstance.validateConnection();

    if (!isValid) {
      return NextResponse.json(
        { error: "Invalid GitHub token or unable to connect. Check your PAT and username." },
        { status: 400 }
      );
    }

    // Create the provider in the database
    const provider = await prisma.taskProvider.create({
      data: {
        name,
        type: "GITHUB",
        userId,
        syncEnabled: true,
        settings: { token, login, ownerType },
      },
    });

    return NextResponse.json({ provider }, { status: 201 });
  } catch (error) {
    logger.error(
      "Failed to connect GitHub provider",
      { error: error instanceof Error ? error.message : "Unknown error" },
      LOG_SOURCE
    );

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request", details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Failed to connect GitHub provider" },
      { status: 500 }
    );
  }
}
