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

import { useLocale, useT } from "@/i18n";
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

const STATUS_KEYS = ["backlog", "ready", "todo", "in_progress", "blocked", "completed"];

/**
 * "Tâches" on a project page: the open tasks of the task list attached to the
 * project — the same list the Tasks and Calendar tabs show under its name.
 */
export function ProjectTasksTile({ agentProjectId, list, tasks, candidates }: ProjectTasksTileProps) {
  const t = useT();
  const locale = useLocale();
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
      if (!res.ok) throw new Error(data.error || t("common.error", { status: res.status }));
      toast.success(projectId ? t("toasts.projects.taskListAttached") : t("toasts.projects.taskListCreated"));
      router.refresh();
    } catch (e) {
      toast.error(t("toasts.projects.taskListLinkFailed"), { description: e instanceof Error ? e.message : undefined });
    } finally {
      setBusy(false);
    }
  };

  const unlink = async () => {
    if (!list) return;
    if (!window.confirm(t("projects.tasksTile.confirmDetach"))) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/link?projectId=${encodeURIComponent(list.id)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(t("common.error", { status: res.status }));
      toast.success(t("toasts.projects.taskListDetached"));
      router.refresh();
    } catch (e) {
      toast.error(t("toasts.projects.taskListDetachFailed"), {
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
          <p className="etiquette">{t("projects.tasksTile.title")}</p>
          {list && (
            <Badge className="px-2.5 py-0.5 text-[11px]">
              {t(list.openCount > 1 ? "projects.tasksTile.openCount.other" : "projects.tasksTile.openCount.one", { count: list.openCount })}{" "}
              ·{" "}
              {t(list.doneCount > 1 ? "projects.tasksTile.doneCount.other" : "projects.tasksTile.doneCount.one", { count: list.doneCount })}
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
              title={t("projects.tasksTile.detach")}
              aria-label={t("projects.tasksTile.detach")}
            >
              <Unlink className="h-4 w-4" />
            </button>
            <Button variant="outline" size="sm" onClick={openInTasks}>
              <ListTodo /> {t("projects.tasksTile.openInTasks")}
            </Button>
          </div>
        )}
      </div>

      {!list ? (
        <div className="mt-4">
          <p className="max-w-xl text-[14px] text-muted-foreground">
            {t("projects.tasksTile.noList")}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button onClick={() => link()} disabled={busy}>
              <Plus /> {t("projects.tasksTile.createList")}
            </Button>
            {candidates.length > 0 && (
              <>
                <Select value={candidate} onValueChange={setCandidate}>
                  <SelectTrigger className="h-10 w-auto min-w-[14rem] rounded-full">
                    <SelectValue placeholder={t("projects.tasksTile.attachExisting")} />
                  </SelectTrigger>
                  <SelectContent>
                    {candidates.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name} ·{" "}
                        {t(c.taskCount > 1 ? "projects.tasksTile.taskCount.other" : "projects.tasksTile.taskCount.one", { count: c.taskCount })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  onClick={() => candidate && link(candidate)}
                  disabled={busy || !candidate}
                >
                  {t("projects.tasksTile.attach")}
                </Button>
              </>
            )}
          </div>
        </div>
      ) : tasks.length === 0 ? (
        <p className="mt-4 text-[14px] text-muted-foreground">
          {t("projects.tasksTile.empty")}
        </p>
      ) : (
        <ol className="mt-4">
          {tasks.map((task, i) => (
            <li
              key={task.id}
              className="flex items-center gap-3 border-b border-border py-3.5 last:border-b-0"
            >
              <span className="rangee-num">{pad2(i + 1)}</span>
              <span className="task-title min-w-0 flex-1 truncate text-[15px]">{task.title}</span>
              <StepsProgress steps={task.steps} />
              {task.dueDate && (
                <span className="hidden text-[12px] text-muted-foreground sm:inline">
                  {new Date(task.dueDate).toLocaleDateString(locale === "en" ? "en-CA" : "fr-CA", { month: "short", day: "numeric" })}
                </span>
              )}
              <Badge
                variant={task.status === "in_progress" ? "tint" : "default"}
                className="px-2.5 py-0.5 text-[11px]"
              >
                {STATUS_KEYS.includes(task.status)
                  ? t(task.status === "ready" ? "projects.tasksTile.status.ready" : `tasks.status.${task.status}`)
                  : task.status}
              </Badge>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
