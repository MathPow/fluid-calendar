"use client";

import Link from "next/link";

import { MoreHorizontal, Pencil, SquareTerminal } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import {
  DEFAULT_PROJECT_COLOR,
  initials,
  readableTextOn,
  terminalUrl,
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
        loading="lazy"
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
      style={{
        backgroundColor: color ?? DEFAULT_PROJECT_COLOR,
        color: readableTextOn(color ?? DEFAULT_PROJECT_COLOR),
      }}
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

  const activities = project._count.activities;

  return (
    <li className="tile relative flex flex-col p-3 md:p-6">
      <Link
        href={href}
        className="flex min-w-0 flex-col gap-2 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:hidden"
      >
        <ProjectMark
          name={project.name}
          color={project.color}
          image={capsule ? `/api/project-media/${capsule.id}` : project.image}
          className="aspect-[4/3] w-full text-2xl"
        />
        <h2 className="line-clamp-2 text-base font-bold leading-tight">
          {project.name}
        </h2>
        <p className="truncate text-xs text-muted-foreground">
          {project.organisation?.name || "Personnel"}
        </p>
      </Link>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Actions pour ${project.name}`}
            className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-card shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden"
          >
            <MoreHorizontal className="h-5 w-5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={href}>Ouvrir la fiche</Link>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onEdit(project)}>
            <Pencil />
            Modifier
          </DropdownMenuItem>
          {projectTerminals(project).map((terminal) => (
            <DropdownMenuItem key={terminal.id} asChild>
              <a href={terminal.url} target="_blank" rel="noopener noreferrer">
                <SquareTerminal /> Terminal · {terminal.machine}
              </a>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <div className="hidden md:flex items-center justify-between gap-3">
        <Link href={href} className="flex min-w-0 items-center gap-3">
          {capsule ? (
            // A small capsule, Steam-list style: keeps tiles the same height.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/project-media/${capsule.id}`}
              alt=""
              loading="lazy"
              className="h-10 w-[86px] shrink-0 rounded-lg object-cover"
            />
          ) : (
            <ProjectMark
              name={project.name}
              color={project.color}
              image={project.image}
              className="h-10 w-10"
            />
          )}
          <div className="min-w-0">
            <h2 className="truncate text-[19px] font-bold leading-tight tracking-title">
              {project.name}.
            </h2>
            {/* No perso/client label: the organisation heading already says it. */}
            {(project.lastActivityAt || activities > 0) && (
              <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
                {[
                  project.lastActivityAt && timeAgoFr(project.lastActivityAt),
                  activities > 0 &&
                    `${activities} activité${activities > 1 ? "s" : ""}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}
          </div>
        </Link>
        <div className="flex shrink-0 items-center">
          <TerminalButton project={project} />
          <button
            type="button"
            onClick={() => onEdit(project)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            aria-label={`Modifier ${project.name}`}
          >
            <Pencil className="h-4 w-4" />
          </button>
        </div>
      </div>

      {(project.description || latest) && (
        <Link href={href} className="mt-3 hidden md:block">
          <p className="line-clamp-2 text-[14px] leading-snug text-muted-foreground">
            {project.description || latest?.summary}
          </p>
        </Link>
      )}

      {project.children.length > 0 && (
        <ol className="mt-3 hidden md:block border-t border-border">
          {project.children.map((c) => (
            <li key={c.id} className="border-b border-border last:border-b-0">
              <Link
                href={`/projets/${encodeURIComponent(c.slug)}`}
                className="flex items-center gap-2.5 py-2 transition-colors hover:text-foreground"
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{
                    backgroundColor:
                      c.color ?? project.color ?? DEFAULT_PROJECT_COLOR,
                  }}
                />
                <span className="min-w-0 flex-1 truncate text-[14px]">
                  {c.name}
                </span>
                {c.lastActivityAt && (
                  <span className="text-[12px] text-muted-foreground">
                    {timeAgoFr(c.lastActivityAt)}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ol>
      )}

      {(project.links.length > 0 ||
        project.contacts.length > 0 ||
        project.stack.length > 0) && (
        <div className="mt-auto hidden md:flex flex-wrap items-center gap-1.5 pt-3">
          {project.links.slice(0, 3).map((l) => (
            <LinkPill key={l.id} kind={l.kind} label={l.label} url={l.url} />
          ))}
          {project.stack.slice(0, 3).map((s) => (
            <Badge key={s} variant="tint" className="px-2 py-0.5 text-[11px]">
              {s}
            </Badge>
          ))}
          {project.contacts.length > 0 && (
            <div
              className="ml-auto flex -space-x-2"
              title={project.contacts.map((c) => c.contact.name).join(", ")}
            >
              {project.contacts.slice(0, 4).map(({ contact }) => (
                <Avatar
                  key={contact.id}
                  image={contact.image}
                  fallback={initials(contact.name)}
                  color="#a8ccff"
                  className="h-7 w-7 text-[10px] ring-2 ring-card"
                />
              ))}
            </div>
          )}
        </div>
      )}
    </li>
  );
}

const iconButton =
  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground";

function projectTerminals(project: ProjectFull) {
  return project.locations
    .map((l) => ({
      id: l.id,
      machine: l.machine.label || l.machine.name,
      url: terminalUrl(l.machine.ttydUrl, l.path),
    }))
    .filter((t): t is { id: string; machine: string; url: string } =>
      Boolean(t.url)
    );
}

/**
 * Opens the project's folder in a machine's web terminal (ttyd). One machine:
 * a plain link; several: a menu to pick which one. Hidden when no machine the
 * project lives on has a terminal address.
 */
function TerminalButton({ project }: { project: ProjectFull }) {
  const terminals = projectTerminals(project);

  if (terminals.length === 0) return null;
  if (terminals.length === 1) {
    return (
      <a
        href={terminals[0].url}
        target="_blank"
        rel="noopener noreferrer"
        className={iconButton}
        aria-label={`Terminal de ${project.name} sur ${terminals[0].machine}`}
        title={`Terminal sur ${terminals[0].machine}`}
      >
        <SquareTerminal className="h-4 w-4" />
      </a>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={iconButton}
          aria-label={`Terminal de ${project.name}`}
          title="Ouvrir un terminal"
        >
          <SquareTerminal className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {terminals.map((t) => (
          <DropdownMenuItem key={t.id} asChild>
            <a href={t.url} target="_blank" rel="noopener noreferrer">
              <SquareTerminal /> {t.machine}
            </a>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
