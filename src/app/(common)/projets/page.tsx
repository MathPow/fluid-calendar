import Link from "next/link";

import { FolderGit2 } from "lucide-react";

import { AskBox } from "@/components/projets/AskBox";
import { prisma } from "@/lib/prisma";

// Activity is written by the bridge at any time; always render fresh.
export const dynamic = "force-dynamic";

function timeAgo(date: Date): string {
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 60) return "à l'instant";
  const m = Math.floor(s / 60);
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.floor(h / 24);
  return `il y a ${d} j`;
}

export default async function ProjetsPage() {
  const projects = await prisma.agentProject.findMany({
    orderBy: [{ lastActivityAt: "desc" }, { name: "asc" }],
    include: {
      activities: { orderBy: { createdAt: "desc" }, take: 1 },
      _count: { select: { activities: true } },
    },
  });

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <header className="mb-5 flex items-center gap-2">
        <FolderGit2 className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-xl font-semibold tracking-tight">Projets</h1>
      </header>

      {projects.length > 0 ? (
        <AskBox placeholder="Pose une question sur tous les projets…" />
      ) : null}

      {projects.length === 0 ? (
        <p className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
          Aucune activité pour l&apos;instant. Dès que Claude termine un tour de
          travail dans un projet (via le terminal web), un résumé apparaîtra
          ici.
        </p>
      ) : (
        <ul className="space-y-3">
          {projects.map((p) => {
            const latest = p.activities[0];
            return (
              <li key={p.id}>
                <Link
                  href={`/projets/${encodeURIComponent(p.slug)}`}
                  className="block rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-accent"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-medium">{p.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {p.lastActivityAt ? timeAgo(p.lastActivityAt) : "—"}
                    </span>
                  </div>
                  {latest ? (
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                      {latest.summary}
                    </p>
                  ) : null}
                  <p className="mt-2 text-xs text-muted-foreground/70">
                    {p._count.activities} activité
                    {p._count.activities > 1 ? "s" : ""}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
