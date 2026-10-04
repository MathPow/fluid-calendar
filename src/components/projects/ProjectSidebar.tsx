"use client";

import { useCallback, useEffect, useState } from "react";

import Link from "next/link";

import { FolderGit2, FolderOpen, Pencil, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

import { useT } from "@/i18n/client";
import { isSaasEnabled } from "@/lib/config";
import { type TaskProjectGroup, groupTaskProjects } from "@/lib/projets/group-task-projects";
import { cn } from "@/lib/utils";

import { useProjectStore } from "@/store/project";
import { useTaskStore } from "@/store/task";

import { Project, ProjectStatus } from "@/types/project";
import { TaskStatus } from "@/types/task";

import { useDroppableProject } from "../dnd/useDragAndDrop";
import { ProjectModal } from "./ProjectModal";

// Special project object to represent "no project" state
const NO_PROJECT: Partial<Project> = {
  id: "no-project",
  name: "No Project",
};

// Interface for task list mappings
interface TaskListMapping {
  id: string;
  providerId: string;
  projectId: string;
  externalListId: string;
  externalListName: string;
}

export function ProjectSidebar() {
  const t = useT();
  const {
    projects,
    loading,
    error,
    fetchProjects,
    setActiveProject,
    activeProject,
  } = useProjectStore();
  const { tasks } = useTaskStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | undefined>();
  const [projectMappings, setProjectMappings] = useState<
    Record<string, TaskListMapping[]>
  >({});
  const [syncingProjects, setSyncingProjects] = useState<Set<string>>(
    new Set()
  );

  const { droppableProps: removeProjectProps, isOver: isOverRemove } =
    useDroppableProject(null);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  // Fetch task list mappings for projects
  useEffect(() => {
    if (projects.length > 0) {
      fetchProjectMappings();
    }
  }, [projects]);

  const fetchProjectMappings = async () => {
    try {
      const response = await fetch("/api/task-sync/mappings");
      const data = await response.json();

      if (data.mappings) {
        // Group mappings by project ID
        const mappingsByProject: Record<string, TaskListMapping[]> = {};

        data.mappings.forEach((mapping: TaskListMapping) => {
          if (!mappingsByProject[mapping.projectId]) {
            mappingsByProject[mapping.projectId] = [];
          }
          mappingsByProject[mapping.projectId].push(mapping);
        });

        setProjectMappings(mappingsByProject);
      }
    } catch (error) {
      console.error("Failed to fetch task list mappings:", error);
    }
  };

  const handleSyncProject = useCallback(
    async (projectId: string, mappingId: string) => {
      if (syncingProjects.has(projectId)) return;

      try {
        setSyncingProjects((prev) => new Set(prev).add(projectId));

        const response = await fetch("/api/task-sync/sync", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            mappingId,
            direction: "bidirectional",
          }),
        });

        if (response.ok) {
          if (isSaasEnabled) {
            toast.success(t("toasts.projects.syncInitiated"));
          } else {
            const { fetchTasks } = useTaskStore.getState();
            await fetchTasks();
            toast.success(t("toasts.projects.syncCompleted"));
          }
        } else {
          toast.error(t("toasts.projects.syncFailed"));
        }
      } catch (error) {
        console.error("Failed to sync project tasks:", error);
        toast.error(t("toasts.projects.syncFailed"));
      } finally {
        setSyncingProjects((prev) => {
          const next = new Set(prev);
          next.delete(projectId);
          return next;
        });
      }
    },
    [syncingProjects, t]
  );

  const activeProjects = projects.filter(
    (project) => project.status === ProjectStatus.ACTIVE
  );
  const archivedProjects = projects.filter(
    (project) => project.status === ProjectStatus.ARCHIVED
  );

  // Open tasks per list: empty lists (and organisations with nothing open)
  // stay out of the way unless asked for.
  const openCount = new Map<string, number>();
  for (const t of tasks) {
    if (t.projectId && t.status !== TaskStatus.COMPLETED) {
      openCount.set(t.projectId, (openCount.get(t.projectId) ?? 0) + 1);
    }
  }
  const [showEmpty, setShowEmpty] = useState(false);
  const allGroups = groupTaskProjects(activeProjects);
  const keep = (p: Project) => showEmpty || (openCount.get(p.id) ?? 0) > 0 || p.id === activeProject?.id;
  const byOrganisation = allGroups
    .map((g) => ({ ...g, projects: g.projects.filter(keep) }))
    .filter((g) => g.projects.length > 0 || (g.general && keep(g.general)));
  const hiddenCount =
    activeProjects.length -
    byOrganisation.reduce((n, g) => n + g.projects.length + (g.general ? 1 : 0), 0);

  // Count non-completed tasks with no project
  const unassignedTasksCount = tasks.filter(
    (task) => !task.projectId && task.status !== TaskStatus.COMPLETED
  ).length;

  const handleEditProject = (project: Project) => {
    setSelectedProject(project);
    setIsModalOpen(true);
  };

  return (
    <>
      <div className="flex h-full w-64 flex-col border-r border-border bg-card">
        <div className="border-b p-4">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[18px] font-bold tracking-title">Projects</h2>
            <Button
              size="icon"
              onClick={() => {
                setSelectedProject(undefined);
                setIsModalOpen(true);
              }}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <div className="space-y-1">
            <Button
              variant={!activeProject ? "secondary" : "ghost"}
              className="w-full justify-start"
              onClick={() => setActiveProject(null)}
            >
              All Tasks
            </Button>
            <Button
              variant={
                activeProject?.id === NO_PROJECT.id ? "secondary" : "ghost"
              }
              className="w-full justify-start gap-2"
              onClick={() => setActiveProject(NO_PROJECT as Project)}
            >
              <FolderOpen className="h-4 w-4 text-muted-foreground" />
              <span className="flex-1">No Project</span>
              <span className="text-xs text-muted-foreground">
                {unassignedTasksCount}
              </span>
            </Button>
          </div>
        </div>

        <ScrollArea className="flex-1 p-4">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <div className="text-sm text-muted-foreground">
                Loading projects...
              </div>
            </div>
          ) : error ? (
            <div className="p-2 text-sm text-destructive">{error.message}</div>
          ) : (
            <div className="space-y-4">
              {byOrganisation.map((group) => (
                <div key={group.key} className="space-y-1">
                  <OrgHeader
                    group={group}
                    count={
                      group.projects.reduce((n, p) => n + (openCount.get(p.id) ?? 0), 0) +
                      (group.general ? (openCount.get(group.general.id) ?? 0) : 0)
                    }
                    isActive={!!group.general && activeProject?.id === group.general.id}
                    onEdit={handleEditProject}
                  />
                  {group.projects.map((project) => (
                    <ProjectItem
                      key={project.id}
                      project={project}
                      isActive={activeProject?.id === project.id}
                      onEdit={handleEditProject}
                      mappings={projectMappings[project.id] || []}
                      isSyncing={syncingProjects.has(project.id)}
                      onSync={handleSyncProject}
                    />
                  ))}
                </div>
              ))}

              {hiddenCount > 0 || showEmpty ? (
                <button
                  type="button"
                  onClick={() => setShowEmpty((v) => !v)}
                  className="w-full rounded-md px-3 py-1.5 text-left text-[12px] text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  {showEmpty
                    ? "Masquer les listes vides"
                    : `${hiddenCount} liste${hiddenCount > 1 ? "s" : ""} vide${hiddenCount > 1 ? "s" : ""} masquée${hiddenCount > 1 ? "s" : ""}`}
                </button>
              ) : null}

              {archivedProjects.length > 0 && showEmpty && (
                <div className="space-y-1">
                  <div className="etiquette py-2">Archived</div>
                  {archivedProjects.map((project) => (
                    <ProjectItem
                      key={project.id}
                      project={project}
                      isActive={activeProject?.id === project.id}
                      onEdit={handleEditProject}
                      mappings={projectMappings[project.id] || []}
                      isSyncing={syncingProjects.has(project.id)}
                      onSync={handleSyncProject}
                    />
                  ))}
                </div>
              )}

              {projects.length === 0 && (
                <div className="py-4 text-center text-sm text-muted-foreground">
                  No projects yet
                </div>
              )}

              {/* Remove from project drop zone */}
              <div
                {...removeProjectProps}
                className={cn(
                  "mt-4 rounded-md border-2 border-dashed p-4 text-center",
                  isOverRemove
                    ? "border-destructive bg-destructive/10"
                    : "border-muted hover:border-muted-foreground/50"
                )}
              >
                <p className="text-sm text-muted-foreground">
                  Drop here to remove from project
                </p>
              </div>
            </div>
          )}
        </ScrollArea>
      </div>

      <ProjectModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedProject(undefined);
        }}
        project={selectedProject}
      />
    </>
  );
}

interface ProjectItemProps {
  project: Project;
  isActive: boolean;
  onEdit: (project: Project) => void;
  mappings: TaskListMapping[];
  isSyncing: boolean;
  onSync: (projectId: string, mappingId: string) => void;
}

function ProjectItem({
  project,
  isActive,
  onEdit,
  mappings,
  isSyncing,
  onSync,
}: ProjectItemProps) {
  const t = useT();
  const { setActiveProject } = useProjectStore();
  const { tasks } = useTaskStore();
  const { droppableProps, isOver } = useDroppableProject(project);

  // Count non-completed tasks for this project
  const taskCount = tasks.filter(
    (task) =>
      task.projectId === project.id && task.status !== TaskStatus.COMPLETED
  ).length;

  // Check if project has any task mappings
  const hasMappings = mappings.length > 0;

  return (
    <div
      {...droppableProps}
      className={cn(
        "group flex w-full cursor-pointer items-center space-x-2 rounded-md px-3 py-2",
        isActive ? "bg-secondary text-secondary-foreground" : "hover:bg-muted",
        isOver && "ring-2 ring-ring"
      )}
      onClick={() => setActiveProject(project)}
    >
      {project.color && (
        <div
          className="h-2 w-2 flex-shrink-0 rounded-full"
          style={{ backgroundColor: project.color }}
        />
      )}
      <span className="project-name flex-1 truncate">{project.name}</span>
      {project.agentProject && (
        <Link
          href={`/projets/${encodeURIComponent(project.agentProject.slug)}`}
          onClick={(e) => e.stopPropagation()}
          className="rounded-full p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-card hover:text-foreground group-hover:opacity-100"
          title={t("projects.sidebar.openInProjets", { name: project.agentProject.name })}
        >
          <FolderGit2 className="h-3.5 w-3.5" />
        </Link>
      )}
      <span className="text-xs text-muted-foreground">{taskCount}</span>

      {hasMappings && (
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 p-0.5 opacity-0 transition-opacity group-hover:opacity-100"
          disabled={isSyncing}
          onClick={(e) => {
            e.stopPropagation();
            onSync(project.id, mappings[0].id);
          }}
        >
          <RefreshCw
            className={cn("h-3.5 w-3.5", isSyncing && "animate-spin")}
          />
        </Button>
      )}

      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 p-0.5 opacity-0 transition-opacity group-hover:opacity-100"
        onClick={(e) => {
          e.stopPropagation();
          onEdit(project);
        }}
      >
        <Pencil className="h-3 w-3" />
      </Button>
    </div>
  );
}

/**
 * An organisation's line in the sidebar: its logo and name. When it has its
 * own list (« StayChum » under StayChum), the line *is* that list: click to
 * open it, drop tasks on it.
 */
function OrgHeader({
  group,
  count,
  isActive,
  onEdit,
}: {
  group: TaskProjectGroup;
  count: number;
  isActive: boolean;
  onEdit: (project: Project) => void;
}) {
  const t = useT();
  const { setActiveProject } = useProjectStore();
  const general = group.general;
  const { droppableProps, isOver } = useDroppableProject(
    (general ?? { id: `org-${group.key}`, name: group.name }) as Project
  );
  const avatar =
    group.key === "none" ? (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-dashed border-muted-foreground/50" />
    ) : group.image ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={group.image} alt="" className="h-5 w-5 shrink-0 rounded-md object-cover" />
    ) : (
      <span
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[9px] font-extrabold text-[#19181c]"
        style={{ backgroundColor: group.color ?? "#d9d4cc" }}
      >
        {group.name.charAt(0).toUpperCase()}
      </span>
    );
  const body = (
    <>
      {avatar}
      <span className="min-w-0 flex-1 truncate text-[13px] font-semibold tracking-title">{group.name}</span>
      {general && (
        <button
          type="button"
          aria-label={t("common.editName", { name: group.name })}
          onClick={(e) => {
            e.stopPropagation();
            onEdit(general);
          }}
          className="text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      )}
      <span className="text-[11px] text-muted-foreground">{count}</span>
    </>
  );
  if (!general) return <div className="flex items-center gap-2 px-1 py-2">{body}</div>;
  return (
    <div
      {...droppableProps}
      onClick={() => setActiveProject(general)}
      className={cn(
        "group flex cursor-pointer items-center gap-2 rounded-md px-1 py-2",
        isActive ? "bg-secondary" : "hover:bg-muted",
        isOver && "ring-2 ring-ring"
      )}
    >
      {body}
    </div>
  );
}
