"use client";

import { useEffect, useState } from "react";

import Link from "next/link";

import { ArrowUpRight, TerminalSquare } from "lucide-react";

import { Button } from "@/components/ui/button";

import { DEFAULT_PROJECT_COLOR, initials } from "@/lib/projets/meta";

import { useStationStore } from "@/store/station";

/**
 * Quick access to projects on the dashboard. Reads the projects managed in the
 * Projets tab; each tile opens the project page, and the small terminal button
 * opens the repo's web terminal at https://mathpow.taila15d52.ts.net:7681/
 * when the project has a folder. Until any project exists, the hard-coded
 * launcher list below is shown so the tab is never empty.
 */
interface LauncherProject {
  id: string;
  slug: string;
  name: string;
  color: string | null;
  station: string;
  parentId: string | null;
  path: string | null;
  image?: string | null;
  logo?: string | null;
}

const TERMINAL_BASE = "https://mathpow.taila15d52.ts.net:7681/";

const FALLBACK: LauncherProject[] = [
  { id: "orka", slug: "orka", name: "Orka", color: "#9fd5f0", station: "personal", parentId: null, path: "orka", logo: "/projects/staychum.svg" },
  { id: "StayChum", slug: "StayChum", name: "StayChum", color: "#9fe0c4", station: "personal", parentId: null, path: "StayChum", logo: "/projects/staychum.svg" },
  { id: "dreamdash", slug: "dreamdash", name: "DreamDash", color: "#a8ccff", station: "personal", parentId: null, path: "dreamdash", logo: "/projects/dreamdash.svg" },
  { id: "meetily", slug: "meetily", name: "Meetily", color: "#cbb2f0", station: "personal", parentId: null, path: "meetily", logo: "/projects/meetily.svg" },
  { id: "realsync-technologies", slug: "realsync-technologies", name: "RealSync", color: "#ffd166", station: "work", parentId: null, path: "realsync-technologies", logo: "/projects/realsync.svg" },
  { id: "ttyd", slug: "ttyd", name: "SpySSH", color: "#bfd3a8", station: "personal", parentId: null, path: "ttyd", logo: "/projects/ttyd.svg" },
];

function Mark({ project }: { project: LauncherProject }) {
  const [errored, setErrored] = useState(false);
  const src = project.image || project.logo;
  if (src && !errored) {
    return (
      // Plain <img> on purpose: next/image's optimizer rejects SVGs and data URLs.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        className="h-12 w-12 rounded-2xl object-contain"
        onError={() => setErrored(true)}
      />
    );
  }
  return (
    <div
      className="flex h-12 w-12 items-center justify-center rounded-2xl text-[15px] font-extrabold text-[#19181c]"
      style={{ backgroundColor: project.color ?? DEFAULT_PROJECT_COLOR }}
    >
      {initials(project.name)}
    </div>
  );
}

export function ProjectLauncher() {
  const { currentStation } = useStationStore();
  const [projects, setProjects] = useState<LauncherProject[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/projets")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: LauncherProject[]) => {
        if (!cancelled) setProjects(rows.filter((p) => !p.parentId));
      })
      .catch(() => {
        if (!cancelled) setProjects([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const fromDb = (projects?.length ?? 0) > 0;
  const list = (fromDb ? projects! : FALLBACK).filter(
    (p) => currentStation === "both" || p.station === currentStation
  );

  return (
    <div>
      {list.length === 0 ? (
        <p className="py-8 text-center text-[13px] text-muted-foreground">
          Aucun projet dans cette station.
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {list.map((p) => {
            const terminal = p.path
              ? `${TERMINAL_BASE}?project=${encodeURIComponent(p.path.split("/").filter(Boolean).pop() ?? p.slug)}`
              : null;
            const inner = (
              <>
                <Mark project={p} />
                <span className="flex items-center gap-0.5 text-center text-[13px] font-medium">
                  {p.name}
                  <ArrowUpRight className="h-3 w-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </span>
              </>
            );
            const tileClass =
              "group relative flex flex-col items-center gap-3 rounded-[20px] bg-secondary p-4 transition-[background-color,box-shadow,transform] hover:-translate-y-0.5 hover:bg-card hover:shadow-tile";
            return (
              <div key={p.id} className="relative">
                {fromDb ? (
                  <Link href={`/projets/${encodeURIComponent(p.slug)}`} className={tileClass}>
                    {inner}
                  </Link>
                ) : (
                  <a href={terminal ?? "#"} target="_blank" rel="noopener noreferrer" className={tileClass}>
                    {inner}
                  </a>
                )}
                {fromDb && terminal && (
                  <a
                    href={terminal}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Ouvrir le terminal"
                    className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-card text-muted-foreground opacity-0 shadow-sm transition-opacity hover:text-foreground group-hover:opacity-100 [div:hover>&]:opacity-100"
                  >
                    <TerminalSquare className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>
            );
          })}
        </div>
      )}
      <p className="mt-5 flex items-center justify-between gap-3 text-[13px] text-muted-foreground">
        <span>
          {fromDb
            ? "Chaque tuile ouvre le dossier du projet; l'icône terminal lance son shell."
            : "Chaque tuile ouvre le terminal du projet dans un nouvel onglet."}
        </span>
        <Button variant="outline" size="sm" asChild>
          <Link href="/projets">Tous les projets</Link>
        </Button>
      </p>
    </div>
  );
}
