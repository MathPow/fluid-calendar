"use client";

import { useEffect, useMemo, useState } from "react";

import Link from "next/link";

import { ArrowUpRight, TerminalSquare } from "lucide-react";

import { Avatar } from "@/components/projets/ImageField";
import { ProjectMark } from "@/components/projets/ProjectTile";
import { Button } from "@/components/ui/button";

import { useT } from "@/i18n/client";
import {
  DEFAULT_PROJECT_COLOR,
  initials,
  terminalUrl,
  timeAgoFr,
} from "@/lib/projets/meta";

import { useStationStore } from "@/store/station";

interface LauncherProject {
  id: string;
  slug: string;
  name: string;
  color: string | null;
  image: string | null;
  description: string | null;
  station: string;
  parentId: string | null;
  organisationId: string | null;
  lastActivityAt: string | null;
  /** Most recently active first. */
  locations: {
    path: string;
    machine: { name: string; label: string | null; ttydUrl: string | null };
  }[];
}

interface LauncherOrganisation {
  id: string;
  name: string;
  color: string | null;
  image: string | null;
  isDefault: boolean;
}

/** Terminal of the most recent machine that has one. */
function projectTerminal(
  p: LauncherProject
): { url: string; machine: string } | null {
  for (const l of p.locations ?? []) {
    const url = terminalUrl(l.machine.ttydUrl, l.path);
    if (url) return { url, machine: l.machine.label || l.machine.name };
  }
  return null;
}

/**
 * Dashboard « Projects » tab: each organisation, in the user's order, with its
 * first four projects (the order set with « Réorganiser » in Projets, else the
 * most recently active). A row opens the project; the terminal icon opens its
 * folder in the machine's web terminal.
 */
export function ProjectLauncher({
  top: TOP = 4,
  description = true,
  columns = false,
  footer = true,
}: {
  /** How many projects each organisation shows. */
  top?: number;
  description?: boolean;
  /** Organisations side by side (a wide section). */
  columns?: boolean;
  footer?: boolean;
} = {}) {
  const t = useT();
  const { currentStation } = useStationStore();
  const [data, setData] = useState<{
    projects: LauncherProject[];
    organisations: LauncherOrganisation[];
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const json = (r: Response) => (r.ok ? r.json() : []);
    Promise.all([
      fetch("/api/projets").then(json),
      fetch("/api/organisations").then(json),
    ])
      .then(([projects, organisations]) => {
        if (!cancelled) setData({ projects, organisations });
      })
      .catch(() => {
        if (!cancelled) setData({ projects: [], organisations: [] });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const groups = useMemo(() => {
    if (!data) return [];
    const top = data.projects.filter(
      (p) =>
        !p.parentId &&
        (currentStation === "both" || p.station === currentStation)
    );
    const known = new Set(
      data.organisations.filter((o) => !o.isDefault).map((o) => o.id)
    );
    // Organisations arrive in the user's order; projects in theirs.
    return data.organisations
      .map((org) => ({
        org,
        projects: top.filter((p) =>
          org.isDefault
            ? !p.organisationId || !known.has(p.organisationId)
            : p.organisationId === org.id
        ),
      }))
      .filter((g) => g.projects.length > 0);
  }, [data, currentStation]);

  if (!data) {
    return (
      <p className="py-8 text-center text-[13px] text-muted-foreground">
        {t("common.loading")}
      </p>
    );
  }

  return (
    <div>
      {groups.length === 0 ? (
        <p className="py-8 text-center text-[13px] text-muted-foreground">
          {t("dashboard.projects.emptyStation")}
        </p>
      ) : (
        <div
          className={
            columns
              ? "grid grid-cols-1 gap-x-8 gap-y-7 sm:grid-cols-2 xl:grid-cols-3"
              : "space-y-7"
          }
        >
          {groups.map(({ org, projects }) => (
            <section key={org.id}>
              <div className="flex items-center gap-2.5">
                <Avatar
                  image={org.image}
                  fallback={initials(org.name)}
                  color={org.color ?? DEFAULT_PROJECT_COLOR}
                  shape="rounded"
                  className="h-7 w-7 text-[10px]"
                />
                <h3 className="text-[15px] font-bold tracking-title">
                  {org.name}
                </h3>
                <span className="text-[12px] text-muted-foreground">
                  {projects.length}
                </span>
              </div>
              <ol className="mt-2">
                {projects.slice(0, TOP).map((p) => {
                  const terminal = projectTerminal(p);
                  return (
                    <li
                      key={p.id}
                      className="group flex items-center gap-3 border-b border-border last:border-b-0"
                    >
                      <Link
                        href={`/projets/${encodeURIComponent(p.slug)}`}
                        className="flex min-w-0 flex-1 items-center gap-3 py-3"
                      >
                        <ProjectMark
                          name={p.name}
                          color={p.color}
                          image={p.image}
                          className="h-9 w-9 rounded-xl text-[12px]"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1 text-[15px] font-semibold tracking-title">
                            <span className="truncate">{p.name}</span>
                            <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                          </span>
                          {description && p.description && (
                            <span className="block truncate text-[13px] text-muted-foreground">
                              {p.description}
                            </span>
                          )}
                        </span>
                        {p.lastActivityAt && (
                          <span className="hidden shrink-0 text-[12px] text-muted-foreground sm:block">
                            {timeAgoFr(p.lastActivityAt)}
                          </span>
                        )}
                      </Link>
                      {terminal && (
                        <a
                          href={terminal.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={t("projects.tile.terminalTitle.single", {
                            machine: terminal.machine,
                          })}
                          aria-label={t("projects.tile.terminalAria.many", {
                            name: p.name,
                          })}
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
                        >
                          <TerminalSquare className="h-4 w-4" />
                        </a>
                      )}
                    </li>
                  );
                })}
              </ol>
              {projects.length > TOP && (
                <Link
                  href="/projets"
                  className="mt-1 inline-block text-[12px] font-medium text-muted-foreground hover:text-foreground"
                >
                  {t(
                    projects.length - TOP > 1
                      ? "dashboard.projects.moreOthersPlural"
                      : "dashboard.projects.moreOthers",
                    { count: projects.length - TOP }
                  )}
                </Link>
              )}
            </section>
          ))}
        </div>
      )}
      {footer && (
        <p className="mt-6 flex items-center justify-between gap-3 text-[13px] text-muted-foreground">
          <span>{t("dashboard.projects.footerHint")}</span>
          <Button variant="outline" size="sm" asChild>
            <Link href="/projets">{t("dashboard.projects.allProjects")}</Link>
          </Button>
        </p>
      )}
    </div>
  );
}
