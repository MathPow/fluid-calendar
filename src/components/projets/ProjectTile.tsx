"use client";

import Link from "next/link";

import { Pencil } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import {
  DEFAULT_PROJECT_COLOR,
  initials,
  pad2,
  stationLabel,
  timeAgoFr,
} from "@/lib/projets/meta";
import type { ProjectFull } from "@/lib/projets/queries";
import { cn } from "@/lib/utils";

import { Avatar } from "./ImageField";
import { LinkPill } from "./link-icons";

/** Monogram square in the project's colour. */
export function ProjectMark({
  name,
  color,
  image,
  className,
}: {
  name: string;
  color: string | null;
  image?: string | null;
  className?: string;
}) {
  if (image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={image}
        alt=""
        className={cn(
          "shrink-0 rounded-2xl object-cover",
          className ?? "h-11 w-11"
        )}
      />
    );
  }
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-2xl text-[15px] font-extrabold text-[#19181c]",
        className ?? "h-11 w-11"
      )}
      style={{ backgroundColor: color ?? DEFAULT_PROJECT_COLOR }}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

export function ProjectTile({
  project,
  onEdit,
}: {
  project: ProjectFull;
  onEdit: (project: ProjectFull) => void;
}) {
  const href = `/projets/${encodeURIComponent(project.slug)}`;
  const latest = project.activities[0];
  const capsule = project.media[0];

  return (
    <li className="tile flex flex-col p-7 md:p-8">
      <div className="flex items-start justify-between gap-4">
        <Link href={href} className="flex min-w-0 items-center gap-4">
          {capsule ? (
            // A small capsule, Steam-list style: keeps tiles the same height.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/project-media/${capsule.id}`}
              alt=""
              loading="lazy"
              className="h-11 w-[94px] shrink-0 rounded-xl object-cover"
            />
          ) : (
            <ProjectMark
              name={project.name}
              color={project.color}
              image={project.image}
            />
          )}
          <div className="min-w-0">
            <p className="etiquette">
              {stationLabel(project.station)}
              {project.lastActivityAt &&
                ` · ${timeAgoFr(project.lastActivityAt)}`}
            </p>
            <h2 className="mt-1.5 truncate text-[24px] font-bold leading-[1.1] tracking-title">
              {project.name}.
            </h2>
          </div>
        </Link>
        <button
          type="button"
          onClick={() => onEdit(project)}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          aria-label={`Modifier ${project.name}`}
        >
          <Pencil className="h-4 w-4" />
        </button>
      </div>

      {(project.description || latest) && (
        <p className="mt-4 line-clamp-2 text-[15px] leading-relaxed text-muted-foreground">
          {project.description || latest?.summary}
        </p>
      )}

      {project.links.length > 0 && (
        <div className="mt-5 flex flex-wrap gap-2">
          {project.links.map((l) => (
            <LinkPill key={l.id} kind={l.kind} label={l.label} url={l.url} />
          ))}
        </div>
      )}

      {project.stack.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {project.stack.map((s) => (
            <Badge key={s} variant="tint" className="px-2.5 py-0.5 text-[11px]">
              {s}
            </Badge>
          ))}
        </div>
      )}

      {project.children.length > 0 && (
        <ol className="mt-6 border-t border-border">
          {project.children.map((c, i) => (
            <li key={c.id} className="border-b border-border last:border-b-0">
              <Link
                href={`/projets/${encodeURIComponent(c.slug)}`}
                className="flex items-baseline gap-3 py-3 transition-colors hover:text-foreground"
              >
                <span className="rangee-num">{pad2(i + 1)}</span>
                <span
                  className="relative top-[-1px] h-2 w-2 shrink-0 rounded-full"
                  style={{
                    backgroundColor:
                      c.color ?? project.color ?? DEFAULT_PROJECT_COLOR,
                  }}
                />
                <span className="min-w-0 flex-1 truncate text-[15px]">
                  {c.name}
                </span>
                <span className="text-[12px] text-muted-foreground">
                  {c._count.activities > 0
                    ? `${c._count.activities} activité${c._count.activities > 1 ? "s" : ""}`
                    : c.lastActivityAt
                      ? timeAgoFr(c.lastActivityAt)
                      : ""}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}

      <div className="mt-6 flex items-end justify-between gap-4 pt-1">
        {project.contacts.length > 0 ? (
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex -space-x-2">
              {project.contacts.slice(0, 4).map(({ contact }) => (
                <Avatar
                  key={contact.id}
                  image={contact.image}
                  fallback={initials(contact.name)}
                  color="#a8ccff"
                  className="h-8 w-8 text-[11px] ring-2 ring-card"
                />
              ))}
            </div>
            <span className="truncate text-[13px] text-muted-foreground">
              {project.contacts.map((c) => c.contact.name).join(", ")}
            </span>
          </div>
        ) : (
          <span className="text-[13px] text-muted-foreground">
            {project._count.activities} activité
            {project._count.activities > 1 ? "s" : ""}
          </span>
        )}
        <Button variant="outline" size="sm" asChild className="shrink-0">
          <Link href={href}>Ouvrir le dossier</Link>
        </Button>
      </div>
    </li>
  );
}
