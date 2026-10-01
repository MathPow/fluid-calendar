"use client";

import { useMemo } from "react";

import { DndContext, DragEndEvent } from "@dnd-kit/core";

import { useT } from "@/i18n/client";

import { useProjectStore } from "@/store/project";
import { useTaskListViewSettings } from "@/store/taskListViewSettings";

import { Task, TaskStatus } from "@/types/task";

import { Column } from "./Column";
import { MobileTaskRow } from "./MobileTaskRow";

interface BoardViewProps {
  tasks: Task[];
  onEdit: (task: Task) => void;
  onDelete: (taskId: string) => void;
  onStatusChange: (taskId: string, status: TaskStatus) => void;
}

export function BoardView({
  tasks,
  onEdit,
  onDelete,
  onStatusChange,
}: BoardViewProps) {
  const t = useT();
  const { activeProject } = useProjectStore();
  const { energyLevel, timePreference, tagIds, search } =
    useTaskListViewSettings();

  // First, filter by project
  const projectFilteredTasks = activeProject
    ? activeProject.id === "no-project"
      ? tasks.filter((task) => !task.projectId)
      : tasks.filter((task) => task.projectId === activeProject.id)
    : tasks;

  // Then apply other filters
  const filteredTasks = useMemo(() => {
    return projectFilteredTasks.filter((task) => {
      // Energy level filter
      if (
        energyLevel?.length &&
        (!task.energyLevel || !energyLevel.includes(task.energyLevel))
      ) {
        return false;
      }

      // Time preference filter
      if (
        timePreference?.length &&
        (!task.preferredTime || !timePreference.includes(task.preferredTime))
      ) {
        return false;
      }

      // Tags filter
      if (tagIds?.length) {
        const taskTagIds = task.tags.map((tag) => tag.id);
        if (!tagIds.some((id) => taskTagIds.includes(id))) {
          return false;
        }
      }

      // Search
      if (search) {
        const searchLower = search.toLowerCase();
        return (
          task.title.toLowerCase().includes(searchLower) ||
          task.description?.toLowerCase().includes(searchLower) ||
          task.tags.some((tag) => tag.name.toLowerCase().includes(searchLower))
        );
      }

      return true;
    });
  }, [projectFilteredTasks, energyLevel, timePreference, tagIds, search]);

  // Group tasks by status
  const columns = useMemo(() => {
    const grouped = Object.values(TaskStatus).reduce(
      (acc, status) => {
        acc[status] = filteredTasks.filter((task) => task.status === status);
        return acc;
      },
      {} as Record<TaskStatus, Task[]>
    );
    return grouped;
  }, [filteredTasks]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over) return;

    const taskId = active.id as string;
    const newStatus = over.id as TaskStatus;

    if (Object.values(TaskStatus).includes(newStatus)) {
      onStatusChange(taskId, newStatus);
    }
  };

  return (
    <div className="flex h-full flex-col bg-background p-4">
      <div className="space-y-4 overflow-y-auto md:hidden">
        <p className="text-xs text-muted-foreground">
          {t("tasks.mobile.swipeHint")}
        </p>
        {Object.values(TaskStatus).map((status) => (
          <section key={status} className="space-y-2">
            <h2 className="text-sm font-semibold">
              {t(`tasks.status.${status}`)} · {columns[status].length}
            </h2>
            {columns[status].map((task) => (
              <MobileTaskRow
                key={task.id}
                task={task}
                onEdit={onEdit}
                onDelete={onDelete}
                onStatusChange={onStatusChange}
              />
            ))}
          </section>
        ))}
      </div>
      <div className="hidden flex-1 gap-4 overflow-auto md:flex">
        <DndContext onDragEnd={handleDragEnd}>
          {Object.values(TaskStatus).map((status) => (
            <Column
              key={status}
              status={status}
              tasks={columns[status]}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </DndContext>
      </div>
    </div>
  );
}
