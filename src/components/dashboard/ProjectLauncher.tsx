"use client";

import { useState } from "react";

import Link from "next/link";

import { ArrowRight, LayoutGrid } from "lucide-react";

/**
 * Quick-launch buttons for each project. Each opens the project's web terminal
 * at https://mathpow.taila15d52.ts.net:7681/?project=<id>. Logos live in
 * /public/projects/<file>.svg; a monogram is shown if a logo is missing.
 */
interface Project {
  id: string;
  name: string;
  logo: string | null;
}

const TERMINAL_BASE = "https://mathpow.taila15d52.ts.net:7681/";

const PROJECTS: Project[] = [
  { id: "orka", name: "Orka", logo: "/projects/staychum.svg" },
  { id: "StayChum", name: "StayChum", logo: "/projects/staychum.svg" },
  { id: "dreamdash", name: "DreamDash", logo: "/projects/dreamdash.svg" },
  { id: "meetily", name: "Meetily", logo: "/projects/meetily.svg" },
  {
    id: "realsync-technologies",
    name: "RealSync",
    logo: "/projects/realsync.svg",
  },
  { id: "ttyd", name: "SpySSH", logo: "/projects/ttyd.svg" },
];

function ProjectLogo({ src, name }: { src: string | null; name: string }) {
  const [errored, setErrored] = useState(false);
  if (!src || errored) {
    return (
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-base font-semibold text-primary">
        {name.charAt(0).toUpperCase()}
      </div>
    );
  }
  return (
    // Plain <img> on purpose: next/image's optimizer rejects SVGs.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      className="h-11 w-11 rounded-xl object-contain"
      onError={() => setErrored(true)}
    />
  );
}

export function ProjectLauncher() {
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <LayoutGrid className="h-4 w-4 text-muted-foreground" />
          Projects
        </h2>
        <Link
          href="/projets"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          Voir les détails
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        {PROJECTS.map((p) => (
          <a
            key={p.id}
            href={`${TERMINAL_BASE}?project=${encodeURIComponent(p.id)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-col items-center gap-2 rounded-xl border border-border bg-background p-3 transition-colors hover:border-primary/40 hover:bg-accent"
          >
            <ProjectLogo src={p.logo} name={p.name} />
            <span className="text-center text-xs font-medium">{p.name}</span>
          </a>
        ))}
      </div>
    </section>
  );
}
