"use client";

import { useMemo, useState } from "react";

import { Building2, ChevronDown, ChevronUp, Pencil, Plus } from "lucide-react";

import { AskBox } from "@/components/projets/AskBox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import {
  DEFAULT_PROJECT_COLOR,
  initials,
  orgKindLabel,
} from "@/lib/projets/meta";
import type { OrganisationLite, ProjectFull } from "@/lib/projets/queries";

import { useStationStore } from "@/store/station";

import { Avatar } from "./ImageField";
import { OrganisationDialog } from "./OrganisationDialog";
import {
  type ContactLite,
  ProjectDialog,
  type ProjectLite,
} from "./ProjectDialog";
import { ProjectTile } from "./ProjectTile";
import { SectionSwitch } from "./SectionSwitch";

interface ProjetsBoardProps {
  projects: ProjectFull[];
  organisations: OrganisationLite[];
  contacts: ContactLite[];
}

/**
 * The Projets tab: one section per organisation (DehorsQC, StayChum…) with
 * its top-level projects as tiles, and the default organisation collecting
 * everything unassigned. Sub-projects are listed inside their parent's tile.
 * The Perso / Client switch in the header filters the projects.
 */
export function ProjetsBoard({
  projects,
  organisations,
  contacts,
}: ProjetsBoardProps) {
  const { currentStation } = useStationStore();
  const [dialog, setDialog] = useState<{
    open: boolean;
    project?: ProjectFull | null;
    organisationId?: string | null;
  }>({ open: false });
  const [orgDialog, setOrgDialog] = useState<{
    open: boolean;
    organisation?: OrganisationLite | null;
  }>({ open: false });
  // Sections show their first few projects; the rest unfold on demand.
  const PREVIEW = 4;
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleExpanded = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const lite: ProjectLite[] = useMemo(
    () =>
      projects.map((p) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        color: p.color,
        parentId: p.parentId,
        station: p.station,
        organisationId: p.organisationId,
      })),
    [projects]
  );

  // Sections in display order: named organisations first, the default last.
  const sections = useMemo(() => {
    const top = projects.filter(
      (p) =>
        !p.parentId &&
        (currentStation === "both" || p.station === currentStation)
    );
    const kindRank = (k: string) =>
      k === "owned" ? 0 : k === "client" ? 1 : 2;
    const ordered = [...organisations].sort(
      (a, b) =>
        Number(a.isDefault) - Number(b.isDefault) ||
        kindRank(a.kind) - kindRank(b.kind) ||
        a.sortOrder - b.sortOrder ||
        a.name.localeCompare(b.name, "fr")
    );
    const known = new Set(organisations.map((o) => o.id));
    return ordered.map((org) => ({
      org,
      projects: top.filter((p) =>
        org.isDefault
          ? !p.organisationId ||
            !known.has(p.organisationId) ||
            p.organisationId === org.id
          : p.organisationId === org.id
      ),
    }));
  }, [projects, organisations, currentStation]);

  const counts = useMemo(
    () => ({ sub: projects.filter((p) => p.parentId).length }),
    [projects]
  );

  const anyVisible = sections.some((s) => s.projects.length > 0);

  return (
    <div className="page pb-16 pt-8 md:pt-12">
      <header className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="display text-[44px] sm:text-[64px] md:text-[80px]">
            Projets.
          </h1>
          <div className="mt-6 flex flex-wrap gap-2">
            <Badge className="px-4 py-2 text-[13px]">
              {organisations.length} organisation
              {organisations.length > 1 ? "s" : ""}
            </Badge>
            {counts.sub > 0 && (
              <Badge className="px-4 py-2 text-[13px]">
                {counts.sub} sous-projet{counts.sub > 1 ? "s" : ""}
              </Badge>
            )}
            {currentStation !== "both" && (
              <Badge variant="tint" className="px-4 py-2 text-[13px]">
                Filtre : {currentStation === "work" ? "Client" : "Perso"}
              </Badge>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <SectionSwitch />
          <Button
            variant="outline"
            size="lg"
            onClick={() => setOrgDialog({ open: true, organisation: null })}
          >
            <Building2 /> Organisation
          </Button>
          <Button
            size="lg"
            onClick={() => setDialog({ open: true, project: null })}
          >
            <Plus /> Nouveau projet
          </Button>
        </div>
      </header>
      <div className="filet mt-8" />

      {projects.length > 0 && (
        <div className="mt-8">
          <AskBox placeholder="Pose une question sur tous les projets…" />
        </div>
      )}

      {projects.length > 0 && !anyVisible ? (
        <div className="tile mt-8 px-6 py-16 text-center">
          <p className="text-[15px] font-semibold tracking-title">
            Aucun projet dans cette station.
          </p>
          <p className="mx-auto mt-1 max-w-md text-[13px] text-muted-foreground">
            Passe le sélecteur Perso / Client / Both dans l&apos;en-tête pour en
            voir d&apos;autres.
          </p>
        </div>
      ) : (
        sections.map(({ org, projects: list }) => {
          // Hide an empty organisation only while a station filter is on.
          if (list.length === 0 && currentStation !== "both") return null;
          return (
            <section key={org.id} className="mt-10">
              <div className="flex flex-wrap items-center gap-3">
                <Avatar
                  image={org.image}
                  fallback={initials(org.name)}
                  color={org.color ?? DEFAULT_PROJECT_COLOR}
                  shape="rounded"
                  className="h-11 w-11 text-[13px]"
                />
                <div className="min-w-0">
                  <h2 className="text-[24px] font-bold leading-none tracking-title">
                    {org.name}
                  </h2>
                  <p className="mt-1 text-[12px] text-muted-foreground">
                    {orgKindLabel(org.kind)} · {list.length} projet
                    {list.length > 1 ? "s" : ""}
                    {org.isDefault && " · par défaut"}
                  </p>
                </div>
                <div className="ml-auto flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() =>
                      setOrgDialog({ open: true, organisation: org })
                    }
                    className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                    aria-label={`Modifier ${org.name}`}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      setDialog({
                        open: true,
                        project: null,
                        organisationId: org.isDefault ? null : org.id,
                      })
                    }
                  >
                    <Plus /> Projet
                  </Button>
                </div>
              </div>
              {org.description && (
                <p className="mt-2 max-w-2xl text-[14px] text-muted-foreground">
                  {org.description}
                </p>
              )}
              {list.length === 0 ? (
                <p className="mt-4 rounded-[20px] bg-secondary/60 px-5 py-6 text-center text-[13px] text-muted-foreground">
                  Aucun projet ici pour l&apos;instant.
                </p>
              ) : (
                <>
                  <ul className="mt-5 grid gap-5 lg:grid-cols-2">
                    {(expanded.has(org.id) ? list : list.slice(0, PREVIEW)).map(
                      (p) => (
                        <ProjectTile
                          key={p.id}
                          project={p}
                          onEdit={(project) =>
                            setDialog({ open: true, project })
                          }
                        />
                      )
                    )}
                  </ul>
                  {list.length > PREVIEW && (
                    <div className="mt-4 flex justify-center">
                      <Button
                        variant="outline"
                        onClick={() => toggleExpanded(org.id)}
                        aria-expanded={expanded.has(org.id)}
                      >
                        {expanded.has(org.id) ? (
                          <>
                            <ChevronUp /> Réduire
                          </>
                        ) : (
                          <>
                            <ChevronDown /> Voir les {list.length - PREVIEW}{" "}
                            autres
                          </>
                        )}
                      </Button>
                    </div>
                  )}
                </>
              )}
            </section>
          );
        })
      )}

      <ProjectDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
        project={dialog.project}
        organisationId={dialog.organisationId}
        projects={lite}
        organisations={organisations}
        contacts={contacts}
      />
      <OrganisationDialog
        open={orgDialog.open}
        onOpenChange={(open) => setOrgDialog((d) => ({ ...d, open }))}
        organisation={orgDialog.organisation}
      />
    </div>
  );
}
