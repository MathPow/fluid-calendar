"use client";

import { useState } from "react";

import { Pencil, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";

import { useT } from "@/i18n/client";
import type { OrganisationLite, ProjectFull } from "@/lib/projets/queries";

import { type ContactLite, ProjectDialog, type ProjectLite } from "./ProjectDialog";

/** "Modifier" and "Sous-projet" buttons on a project page, with their dialog. */
export function ProjectDetailActions({
  project,
  projects,
  organisations,
  contacts,
}: {
  project: ProjectFull;
  projects: ProjectLite[];
  organisations: OrganisationLite[];
  contacts: ContactLite[];
}) {
  const t = useT();
  const [mode, setMode] = useState<"closed" | "edit" | "child">("closed");

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => setMode("edit")}>
          <Pencil /> {t("projects.detail.actions.edit")}
        </Button>
        <Button onClick={() => setMode("child")}>
          <Plus /> {t("projects.detail.actions.child")}
        </Button>
      </div>
      <ProjectDialog
        open={mode !== "closed"}
        onOpenChange={(open) => !open && setMode("closed")}
        project={mode === "edit" ? project : null}
        parentId={mode === "child" ? project.id : null}
        projects={projects}
        organisations={organisations}
        contacts={contacts}
      />
    </>
  );
}
