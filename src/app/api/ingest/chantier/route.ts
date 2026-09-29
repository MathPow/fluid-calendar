import { NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { ingestTokenOk } from "@/lib/ingest-auth";
import { notify, ownerUserId } from "@/lib/notifications";

export const dynamic = "force-dynamic";

// The payload chantier posts to SIGNALEMENT_WEBHOOK_URL when a client flags a
// result (see chantier's src/lib/notify/signalement.ts).
const Signalement = z.object({
  type: z.literal("signalement"),
  projet: z.object({
    id: z.string(),
    slug: z.string(),
    nom: z.string(),
    url: z.string().url(),
  }),
  demande: z.object({
    at: z.string(),
    prompt: z.string(),
    summary: z.string().optional(),
  }),
  signalement: z
    .object({
      motif: z.string(),
      auteur: z.string().nullish(),
      commentaire: z.string().nullish(),
      at: z.string().optional(),
    })
    .passthrough(),
});

const MOTIFS: Record<string, string> = {
  "ne-marche-pas": "ça ne marche pas",
  "pas-satisfait": "pas satisfait du résultat",
};

/**
 * POST /api/ingest/chantier — a client flagged a chantier result. Becomes an
 * important notification (pushed to the phone) linking to the client's page.
 */
export async function POST(request: NextRequest) {
  if (!ingestTokenOk(request))
    return new NextResponse("Unauthorized", { status: 401 });
  const parsed = Signalement.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { projet, demande, signalement } = parsed.data;
  const userId = await ownerUserId();
  if (!userId) return NextResponse.json({ error: "No user" }, { status: 503 });

  const qui = signalement.auteur ? ` (${signalement.auteur})` : "";
  const motif = MOTIFS[signalement.motif] ?? signalement.motif;
  const extrait = demande.prompt.replace(/\s+/g, " ").trim().slice(0, 120);
  const row = await notify(userId, {
    kind: "chantier_flag",
    source: "chantier",
    important: true,
    title: `Chantier · ${projet.nom}${qui} : ${motif}`,
    body: [`« ${extrait} »`, signalement.commentaire?.trim()]
      .filter(Boolean)
      .join("\n"),
    url: projet.url,
    dedupeKey: `chantier:${projet.id}:${demande.at}:${signalement.at ?? signalement.motif}`,
  });
  return NextResponse.json({ ok: true, duplicate: !row }, { status: 201 });
}
