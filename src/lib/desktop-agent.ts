import type { NextRequest } from "next/server";

import { createHash, randomBytes } from "node:crypto";

import { prisma } from "@/lib/prisma";

/** Commands the agent didn't pick up in time never run (the computer was off). */
export const QUEUE_TTL_MS = 5 * 60_000;
/** A command still « running » after this is considered lost. */
export const RUN_TTL_MS = 15 * 60_000;

export const hashAgentToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

export const newAgentToken = () => randomBytes(32).toString("base64url");

/** The machine whose agent sent this request (Bearer token), or null. */
export async function agentMachine(request: NextRequest) {
  const token = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "")
    .trim();
  if (!token || token.length < 20) return null;
  return prisma.machine.findUnique({
    where: { agentTokenHash: hashAgentToken(token) },
    select: { id: true, name: true },
  });
}

/** Fail commands that waited or ran too long. */
export async function expireCommands(machineId: string) {
  const now = Date.now();
  await prisma.$transaction([
    prisma.desktopCommand.updateMany({
      where: {
        machineId,
        status: "queued",
        createdAt: { lt: new Date(now - QUEUE_TTL_MS) },
      },
      data: {
        status: "failed",
        error: "L'ordi n'a pas répondu à temps.",
        finishedAt: new Date(),
      },
    }),
    prisma.desktopCommand.updateMany({
      where: {
        machineId,
        status: "running",
        startedAt: { lt: new Date(now - RUN_TTL_MS) },
      },
      data: {
        status: "failed",
        error: "Sans nouvelles de l'agent.",
        finishedAt: new Date(),
      },
    }),
  ]);
}
