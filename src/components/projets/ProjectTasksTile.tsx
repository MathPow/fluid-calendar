"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";

import { ListTodo, Plus, Unlink } from "lucide-react";
import { toast } from "sonner";

import { StepsProgress } from "@/components/tasks/components/StepsEditor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { pad2 } from "@/lib/projets/meta";

import { useProjectStore } from "@/store/project";

export interface TileTask {
  id: string;
  title: string;
  status: string;
  dueDate: string | null;
  steps: { done: boolean }[];
}

interface ProjectTasksTileProps {
  agentProjectId: string;
  /** The task list attached to this project, if any. */
  list: { id: string; openCount: number; doneCount: number } | null;
  tasks: TileTask[];
  /** Task lists not attached to any project, offered for attaching. */
  candidates: { id: string; name: string; taskCount: number }[];
}

const STATUS_LABEL: Record<string, string> = {
  backlog: "Backlog",
  todo: "À faire",
  in_progress: "En cours",
  completed: "Fait",
};

/**
 * "Tâches" on a project page: the open tasks of the task list attached to the
 * project — the same list the Tasks and Calendar tabs show under its name.
 */
export function ProjectTasksTile({ agentProjectId, list, tasks, candidates }: ProjectTasksTileProps) {
  const router = useRouter();
  const { fetchProjects, setActiveProject } = useProjectStore();
  const [busy, setBusy] = useState(false);
  const [candidate, setCandidate] = useState<string>("");

  const link = async (projectId?: string) => {
    setBusy(true);
    try {
      const res = await fetch("/api/projects/link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ agentProjectId, ...(projectId ? { projectId } : {}) }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
      toast.success(projectId ? "Liste de tâches rattachée." : "Liste de tâches créée.");
      router.refresh();
    } catch (e) {
      toast.error("Liaison impossible", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setBusy(false);
    }
  };

  const unlink = async () => {
    if (!list) return;
    if (!window.confirm("Détacher la liste de tâches de ce projet ? Les tâches sont conservées.")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/link?projectId=${encodeURIComponent(list.id)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`Erreur ${res.status}`);
      toast.success("Liste détachée.");
      router.refresh();
    } catch (e) {
      toast.error("Détachement impossible", {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  };

  const openInTasks = async () => {
    if (!list) return;
    await fetchProjects();
    const project = useProjectStore.getState().projects.find((p) => p.id === list.id);
    if (project) setActiveProject(project);
    router.push("/tasks");
  };

  return (
    <section className="tile mt-5 p-7 md:p-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <p className="etiquette">Tâches</p>
          {list && (
            <Badge className="px-2.5 py-0.5 text-[11px]">
              {list.openCount} ouverte{list.openCount > 1 ? "s" : ""} · {list.doneCount} faite
              {list.doneCount > 1 ? "s" : ""}
            </Badge>
          )}
        </div>
        {list && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={unlink}
              disabled={busy}
              className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              title="Détacher la liste de tâches"
              aria-label="Détacher la liste de tâches"
            >
              <Unlink className="h-4 w-4" />
            </button>
            <Button variant="outline" size="sm" onClick={openInTasks}>
              <ListTodo /> Ouvrir dans Tâches
            </Button>
          </div>
        )}
      </div>

      {!list ? (
        <div className="mt-4">
          <p className="max-w-xl text-[14px] text-muted-foreground">
            Ce projet n&apos;a pas encore de liste de tâches. Crée-la, ou rattache une liste qui
            existe déjà dans l&apos;onglet Tâches : elle prendra le nom et la couleur du projet.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button onClick={() => link()} disabled={busy}>
              <Plus /> Créer la liste de tâches
            </Button>
            {candidates.length > 0 && (
              <>
                <Select value={candidate} onValueChange={setCandidate}>
                  <SelectTrigger className="h-10 w-auto min-w-[14rem] rounded-full">
                    <SelectValue placeholder="…ou rattacher une liste existante" />
                  </SelectTrigger>
                  <SelectContent>
                    {candidates.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name} · {c.taskCount} tâche{c.taskCount > 1 ? "s" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  onClick={() => candidate && link(candidate)}
                  disabled={busy || !candidate}
                >
                  Rattacher
                </Button>
              </>
            )}
          </div>
        </div>
      ) : tasks.length === 0 ? (
        <p className="mt-4 text-[14px] text-muted-foreground">
          Aucune tâche ouverte. Ajoute-en depuis l&apos;onglet Tâches ou le calendrier en
          choisissant ce projet.
        </p>
      ) : (
        <ol className="mt-4">
          {tasks.map((t, i) => (
            <li
              key={t.id}
              className="flex items-center gap-3 border-b border-border py-3.5 last:border-b-0"
            >
              <span className="rangee-num">{pad2(i + 1)}</span>
              <span className="task-title min-w-0 flex-1 truncate text-[15px]">{t.title}</span>
              <StepsProgress steps={t.steps} />
              {t.dueDate && (
                <span className="hidden text-[12px] text-muted-foreground sm:inline">
                  {new Date(t.dueDate).toLocaleDateString("fr-CA", { month: "short", day: "numeric" })}
                </span>
              )}
              <Badge
                variant={t.status === "in_progress" ? "tint" : "default"}
                className="px-2.5 py-0.5 text-[11px]"
              >
                {STATUS_LABEL[t.status] ?? t.status}
              </Badge>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
