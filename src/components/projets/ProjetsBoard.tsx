"use client";

import { useMemo, useState } from "react";

import { Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { AskBox } from "@/components/projets/AskBox";
import type { ProjectFull } from "@/lib/projets/queries";

import { useStationStore } from "@/store/station";

import { type ContactLite, ProjectDialog, type ProjectLite } from "./ProjectDialog";
import { ProjectTile } from "./ProjectTile";
import { SectionSwitch } from "./SectionSwitch";

interface ProjetsBoardProps {
  projects: ProjectFull[];
  contacts: ContactLite[];
}

/**
 * The Projets tab: top-level projects as tiles (sub-projects listed inside
 * their parent), filtered by the Perso / Client switch in the header.
 */
export function ProjetsBoard({ projects, contacts }: ProjetsBoardProps) {
  const { currentStation } = useStationStore();
  const [dialog, setDialog] = useState<{
    open: boolean;
    project?: ProjectFull | null;
  }>({ open: false });

  const lite: ProjectLite[] = useMemo(
    () =>
      projects.map((p) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        color: p.color,
        parentId: p.parentId,
        station: p.station,
      })),
    [projects]
  );

  const visible = useMemo(() => {
    const top = projects.filter((p) => !p.parentId);
    if (currentStation === "both") return top;
    return top.filter((p) => p.station === currentStation);
  }, [projects, currentStation]);

  const counts = useMemo(
    () => ({
      perso: projects.filter((p) => !p.parentId && p.station === "personal").length,
      client: projects.filter((p) => !p.parentId && p.station === "work").length,
      sub: projects.filter((p) => p.parentId).length,
    }),
    [projects]
  );

  return (
    <div className="page pb-16 pt-8 md:pt-12">
      <header className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="display text-[44px] sm:text-[64px] md:text-[80px]">Projets.</h1>
          <div className="mt-6 flex flex-wrap gap-2">
            <Badge className="px-4 py-2 text-[13px]">
              {counts.perso} perso · {counts.client} client{counts.client > 1 ? "s" : ""}
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
          <Button size="lg" onClick={() => setDialog({ open: true, project: null })}>
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

      {visible.length === 0 ? (
        <div className="tile mt-8 px-6 py-16 text-center">
          <p className="text-[15px] font-semibold tracking-title">
            {projects.length === 0
              ? "Aucun projet pour l'instant."
              : "Aucun projet dans cette station."}
          </p>
          <p className="mx-auto mt-1 max-w-md text-[13px] text-muted-foreground">
            {projects.length === 0
              ? "Crée ton premier projet : il regroupera ses liens, ses outils, ses contacts et ses sous-projets."
              : "Passe le sélecteur Perso / Client / Both dans l'en-tête pour en voir d'autres."}
          </p>
          <Button className="mt-6" onClick={() => setDialog({ open: true, project: null })}>
            <Plus /> Nouveau projet
          </Button>
        </div>
      ) : (
        <ul className="mt-5 grid gap-5 lg:grid-cols-2">
          {visible.map((p) => (
            <ProjectTile
              key={p.id}
              project={p}
              onEdit={(project) => setDialog({ open: true, project })}
            />
          ))}
        </ul>
      )}

      <ProjectDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
        project={dialog.project}
        projects={lite}
        contacts={contacts}
      />
    </div>
  );
}
