import Link from "next/link";
import { notFound } from "next/navigation";

import { ArrowLeft } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { AskBox } from "@/components/projets/AskBox";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function formatStamp(date: Date): string {
  return date.toLocaleString("fr-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default async function ProjetDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params; // Next already URL-decodes route params
  const project = await prisma.agentProject.findUnique({
    where: { slug },
    include: {
      activities: { orderBy: { createdAt: "desc" }, take: 200 },
    },
  });

  if (!project) notFound();

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <Link
        href="/projets"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Tous les projets
      </Link>

      <header className="mb-5">
        <h1 className="text-xl font-semibold tracking-tight">{project.name}</h1>
        {project.path ? (
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            {project.path}
          </p>
        ) : null}
      </header>

      <AskBox slug={project.slug} />

      {project.activities.length === 0 ? (
        <p className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
          Aucune activité enregistrée pour ce projet.
        </p>
      ) : (
        <ol className="space-y-3">
          {project.activities.map((a) => (
            <li
              key={a.id}
              className="rounded-xl border border-border bg-card p-4"
            >
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <time className="text-xs text-muted-foreground">
                  {formatStamp(a.createdAt)}
                </time>
                {a.agent ? (
                  <Badge variant="secondary" className="text-[10px]">
                    {a.agent}
                  </Badge>
                ) : null}
                {a.source ? (
                  <Badge variant="outline" className="text-[10px]">
                    {a.source}
                  </Badge>
                ) : null}
              </div>
              <div className="text-sm leading-7 text-foreground/90 [&_li]:ml-5 [&_li]:list-disc [&_p]:mb-2 [&_strong]:font-semibold">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {a.summary}
                </ReactMarkdown>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
