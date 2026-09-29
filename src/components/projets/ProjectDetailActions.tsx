"use client";

import { useState } from "react";

import { Pencil, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";

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
  const [mode, setMode] = useState<"closed" | "edit" | "child">("closed");

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => setMode("edit")}>
          <Pencil /> Modifier
        </Button>
        <Button onClick={() => setMode("child")}>
          <Plus /> Sous-projet
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
