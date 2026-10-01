"use client";

import { useEffect, useState } from "react";

import Link from "next/link";

import { Kanban, ListTodo, Target } from "lucide-react";
import { toast } from "sonner";

import { ProjectSidebar } from "@/components/projects/ProjectSidebar";
import { BoardView } from "@/components/tasks/BoardView/BoardView";
import { TaskList } from "@/components/tasks/TaskList";
import { TaskModal } from "@/components/tasks/TaskModal";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";

import { useT } from "@/i18n/client";

import { useProjectStore } from "@/store/project";
import { useTaskStore } from "@/store/task";
import { useTaskModalStore } from "@/store/taskModal";
import { useTaskPageSettings } from "@/store/taskPageSettings";

import { NewTask, Task, TaskStatus } from "@/types/task";

export default function TasksPage() {
  const t = useT();
  const {
    tasks,
    tags,
    loading,
    error,
    fetchTasks,
    fetchTags,
    createTask,
    updateTask,
    deleteTask,
    createTag,
    scheduleAllTasks,
  } = useTaskStore();
  const { fetchProjects, activeProject } = useProjectStore();
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 767px)");
    const update = () => setMobile(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  const { viewMode, setViewMode } = useTaskPageSettings();
  const { isOpen, setOpen } = useTaskModalStore();

  const [selectedTask, setSelectedTask] = useState<Task | undefined>();
  const [initialProjectId, setInitialProjectId] = useState<
    string | null | undefined
  >(undefined);

  // Fetch tasks and tags on mount
  useEffect(() => {
    fetchTasks();
    fetchTags();
    fetchProjects();
  }, [fetchTasks, fetchTags, fetchProjects]);

  const handleCreateTask = async (task: NewTask) => {
    await createTask(task);
    await fetchTasks();
    await fetchProjects();
  };

  const handleUpdateTask = async (task: NewTask) => {
    if (selectedTask) {
      await updateTask(selectedTask.id, task);
      await fetchTasks();
      await fetchProjects();
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (confirm(t("tasks.confirm.delete"))) {
      await deleteTask(taskId);
      await fetchTasks();
      await fetchProjects();
    }
  };

  const handleStatusChange = async (taskId: string, status: TaskStatus) => {
    await updateTask(taskId, { status });
    await fetchTasks();
    await fetchProjects();
  };

  const handleCreateTag = async (name: string, color?: string) => {
    try {
      const newTag = await createTag({ name, color });
      await fetchTags(); // Refresh tags after creation
      return newTag;
    } catch (error) {
      console.error("Error creating tag:", error);
      throw error;
    }
  };

  const handleInlineEdit = async (task: Task) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id, tags, createdAt, updatedAt, project, ...updates } = task;
    console.log("Updating task:", { id, updates });
    try {
      await updateTask(id, updates);
      await fetchTasks();
      // If projectId was changed, refresh projects to update task counts
      if ("projectId" in updates) {
        await fetchProjects();
      }
    } catch (error) {
      console.error("Error updating task:", error);
      toast.error(t("tasks.toasts.updateFailedTitle"), {
        description: t("tasks.toasts.updateFailedDesc"),
      });
    }
  };

  const handleCreateTaskClick = () => {
    setSelectedTask(undefined);
    const projectId = activeProject
      ? activeProject.id === "no-project"
        ? null
        : activeProject.id
      : undefined;
    setInitialProjectId(projectId);
    setOpen(true);
  };

  return (
    <div className="flex h-full">
      {/* Sidebar: hidden on mobile */}
      <div className="hidden md:block">
        <ProjectSidebar />
      </div>

      <div className="flex min-w-0 flex-1 flex-col" data-task-page>
        <div className="border-b border-border px-4 pb-4 pt-5 md:px-8 md:pb-5 md:pt-7">
          {/* Row 1: title + create button */}
          <div className="flex items-center justify-between gap-2">
            <h1 className="display text-[32px] md:text-[40px]">{t("tasks.title")}</h1>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => scheduleAllTasks()}
                className="hidden md:inline-flex"
              >
                {t("tasks.actions.autoSchedule")}
              </Button>
              <Button data-create-task-button onClick={handleCreateTaskClick}>
                {t("tasks.actions.newTask")}
              </Button>
            </div>
          </div>

          {/* Row 2: view switcher */}
          <div className="segmented mt-4">
            <button
              onClick={() => setViewMode("list")}
              className="segmented-item"
              data-active={mobile || viewMode === "list"}
            >
              <ListTodo className="h-4 w-4" />
              {t("tasks.view.list")}
            </button>
            <button
              onClick={() => setViewMode("board")}
              className="segmented-item hidden md:inline-flex"
              data-active={viewMode === "board"}
            >
              <Kanban className="h-4 w-4" />
              {t("tasks.view.board")}
            </button>
            <Link href="/focus" className="segmented-item">
              <Target className="h-4 w-4" />
              {t("tasks.view.focus")}
            </Link>
          </div>

          {error && (
            <Alert variant="destructive" className="mt-4">
              <AlertDescription>{error.message}</AlertDescription>
            </Alert>
          )}
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-3 pb-20 md:p-6 md:pb-6">
          {mobile || viewMode === "list" ? (
            <TaskList
              tasks={tasks}
              onEdit={(task) => {
                setSelectedTask(task);
                setOpen(true);
              }}
              onDelete={handleDeleteTask}
              onStatusChange={handleStatusChange}
              onInlineEdit={handleInlineEdit}
            />
          ) : (
            <BoardView
              tasks={tasks}
              onEdit={(task) => {
                setSelectedTask(task);
                setOpen(true);
              }}
              onDelete={handleDeleteTask}
              onStatusChange={handleStatusChange}
            />
          )}
        </div>

        <TaskModal
          isOpen={isOpen}
          onClose={() => {
            setOpen(false);
            setSelectedTask(undefined);
            setInitialProjectId(undefined);
          }}
          onSave={selectedTask ? handleUpdateTask : handleCreateTask}
          task={selectedTask}
          tags={tags}
          onCreateTag={handleCreateTag}
          initialProjectId={initialProjectId}
        />

        {loading && (
          <div className="fixed inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm">
            <div className="rounded-[24px] bg-card p-5 shadow-float">
              <LoadingSpinner size="lg" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
