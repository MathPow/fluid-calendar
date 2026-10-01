"use client";

import { StepsProgress } from "../components/StepsEditor";

import { useDraggable } from "@dnd-kit/core";
import { Clock, Lock, Pencil, Trash2 } from "lucide-react";

import { useT } from "@/i18n/client";
import { format, newDate } from "@/lib/date-utils";
import { cn } from "@/lib/utils";

import { Task, TimePreference } from "@/types/task";

import { contextualDate } from "../utils/task-list-utils";

interface BoardTaskProps {
  task: Task;
  onEdit: (task: Task) => void;
  onDelete: (taskId: string) => void;
}

const energyLevelColors = {
  high: "bg-negative text-negative-foreground",
  medium: "bg-pending text-pending-foreground",
  low: "bg-positive text-positive-foreground",
};

const timePreferenceColors = {
  [TimePreference.MORNING]: "bg-tint-soft text-foreground",
  [TimePreference.AFTERNOON]:
    "bg-pending text-pending-foreground",
  [TimePreference.EVENING]:
    "bg-secondary text-muted-foreground",
};

export function BoardTask({ task, onEdit, onDelete }: BoardTaskProps) {
  const t = useT();
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: task.id,
      data: {
        type: "task",
        task,
      },
    });

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      }
    : undefined;

  const renderDueDate = (date: Date) => {
    const info = contextualDate(date, { utcMidnight: true });
    const base =
      info.kind === "today"
        ? t("tasks.date.today")
        : info.kind === "tomorrow"
          ? t("tasks.date.tomorrow")
          : info.base;
    const text = info.isOverdue ? t("tasks.date.overdue", { text: base }) : base;
    return { text, isOverdue: info.isOverdue };
  };

  return (
    <div className="group relative">
      <div
        ref={setNodeRef}
        {...attributes}
        {...listeners}
        style={style}
        className={cn(
          "cursor-grab rounded-lg border bg-card p-3 shadow-sm transition-shadow hover:shadow-md",
          isDragging && "opacity-50"
        )}
      >
        <div className="space-y-2">
          <div className="flex items-start gap-2">
            <div className="flex items-center gap-2">
              {task.isAutoScheduled && (
                <div
                  className="flex items-center gap-1 text-primary"
                  title={t("tasks.row.autoScheduled")}
                >
                  <Clock className="h-4 w-4" />
                  {task.scheduleLocked && (
                    <Lock className="h-3 w-3">
                      <title>{t("tasks.row.scheduleLocked")}</title>
                    </Lock>
                  )}
                </div>
              )}
              <h3 className="task-title text-sm font-medium">{task.title}</h3>
            </div>
          </div>

          {task.description && (
            <p className="task-description line-clamp-2 text-xs text-muted-foreground">
              {task.description}
            </p>
          )}

          <StepsProgress steps={task.steps} />

          {task.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {task.tags.map((tag) => (
                <span
                  key={tag.id}
                  className="inline-flex items-center rounded px-1.5 py-0.5 text-xs"
                  style={{
                    backgroundColor: `${tag.color}20` || "var(--muted)",
                    color: tag.color || "var(--muted-foreground)",
                  }}
                >
                  {tag.name}
                </span>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 text-xs">
            {task.energyLevel && (
              <span
                className={cn(
                  "rounded-full px-2 py-1",
                  energyLevelColors[task.energyLevel]
                )}
              >
                {t(`tasks.energy.${task.energyLevel}`)}
              </span>
            )}

            {task.preferredTime && (
              <span
                className={cn(
                  "rounded-full px-2 py-1",
                  timePreferenceColors[task.preferredTime]
                )}
              >
                {t(`tasks.time.${task.preferredTime}`)}
              </span>
            )}

            {task.duration && (
              <span className="text-muted-foreground">{task.duration}m</span>
            )}

            {task.dueDate && (() => {
              const due = renderDueDate(newDate(task.dueDate));
              return (
                <span
                  className={cn(
                    due.isOverdue ? "text-destructive" : "text-muted-foreground"
                  )}
                >
                  {due.text}
                </span>
              );
            })()}

            {task.project && (
              <div className="flex items-center gap-1">
                <div
                  className="h-2 w-2 rounded-full"
                  style={{
                    backgroundColor: task.project.color || "var(--muted)",
                  }}
                />
                <span className="text-muted-foreground">
                  {task.project.name}
                </span>
              </div>
            )}

            {task.isAutoScheduled &&
              task.scheduledStart &&
              task.scheduledEnd && (
                <span className="text-primary">
                  {format(newDate(task.scheduledStart), "p")} -{" "}
                  {format(newDate(task.scheduledEnd), "p")}
                  {task.scheduleScore && (
                    <span className="ml-1 text-primary/70">
                      ({Math.round(task.scheduleScore * 100)}%)
                    </span>
                  )}
                </span>
              )}
          </div>
        </div>
      </div>
      <div className="absolute right-2 top-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          type="button"
          onClick={() => onEdit(task)}
          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-primary"
          title={t("tasks.row.edit")}
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => onDelete(task.id)}
          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
          title={t("tasks.row.delete")}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
