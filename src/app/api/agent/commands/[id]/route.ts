import { NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { agentMachine } from "@/lib/desktop-agent";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({
  status: z.enum(["done", "failed", "denied"]),
  output: z.string().max(40_000).optional(),
  error: z.string().max(2000).optional(),
});

/** PATCH /api/agent/commands/[id] — the agent reports how a command went. */
export async function PATCH(request: NextRequest, { params }: Ctx) {
  const machine = await agentMachine(request);
  if (!machine) return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await params;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  const { status, output, error } = parsed.data;
  const { count } = await prisma.desktopCommand.updateMany({
    where: { id, machineId: machine.id, status: "running" },
    data: {
      status,
      output: output ? output.slice(-20_000) : null,
      error: error || null,
      finishedAt: new Date(),
    },
  });
  if (count === 0)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
