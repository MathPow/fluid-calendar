import { NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { ingestTokenOk } from "@/lib/ingest-auth";
import { notify, ownerUserId } from "@/lib/notifications";

export const dynamic = "force-dynamic";

const Body = z.object({
  kind: z.string().trim().min(1).max(40).default("custom"),
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().max(1000).optional(),
  url: z.string().trim().max(1000).optional(),
  source: z.string().trim().max(40).optional(),
  important: z.boolean().optional(),
  dedupeKey: z.string().trim().max(200).optional(),
});

/**
 * POST /api/ingest/notifications — any script or app can drop a notification
 * (PROJECT_INGEST_TOKEN). `important: true` also pushes it to the phone.
 */
export async function POST(request: NextRequest) {
  if (!ingestTokenOk(request))
    return new NextResponse("Unauthorized", { status: 401 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const userId = await ownerUserId();
  if (!userId) return NextResponse.json({ error: "No user" }, { status: 503 });
  const row = await notify(userId, parsed.data);
  return NextResponse.json(
    { ok: true, duplicate: !row, id: row?.id ?? null },
    { status: 201 }
  );
}
