"use client";

import { useDroppable } from "@dnd-kit/core";

import { cn } from "@/lib/utils";

import { Task, TaskStatus } from "@/types/task";

import { STATUS_LABELS } from "../utils/task-list-utils";
import { BoardTask } from "./BoardTask";

interface ColumnProps {
  status: TaskStatus;
  tasks: Task[];
  onEdit: (task: Task) => void;
  onDelete: (taskId: string) => void;
}

const statusColors = {
  [TaskStatus.BACKLOG]: "bg-secondary border-border",
  [TaskStatus.READY]: "bg-violet-500/10 border-violet-500/30",
  [TaskStatus.BLOCKED]: "bg-negative/40 border-negative",
  [TaskStatus.TODO]: "bg-pending/60 border-pending",
  [TaskStatus.IN_PROGRESS]: "bg-tint-soft border-tint/40",
  [TaskStatus.COMPLETED]: "bg-positive/60 border-positive",
};

const statusHeaderColors = {
  [TaskStatus.BACKLOG]: "bg-secondary text-muted-foreground",
  [TaskStatus.READY]: "bg-violet-500/20 text-violet-800 dark:text-violet-200",
  [TaskStatus.BLOCKED]: "bg-negative text-negative-foreground",
  [TaskStatus.TODO]: "bg-pending text-pending-foreground",
  [TaskStatus.IN_PROGRESS]: "bg-tint-soft text-foreground",
  [TaskStatus.COMPLETED]: "bg-positive text-positive-foreground",
};

// Helper function to format enum values for display
const formatEnumValue = (value: string) => {
  if (STATUS_LABELS[value]) return STATUS_LABELS[value];
  return value
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

export function Column({ status, tasks, onEdit, onDelete }: ColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: status,
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex w-80 flex-shrink-0 flex-col rounded-[20px] border",
        statusColors[status],
        isOver && "ring-2 ring-ring"
      )}
    >
      <div className="border-b border-border p-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "rounded-full px-2.5 py-0.5 text-sm font-medium",
                statusHeaderColors[status]
              )}
            >
              {formatEnumValue(status)}
            </span>
            <span className="text-sm text-muted-foreground">
              {tasks.length}
            </span>
          </div>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        <div className="space-y-2">
          {tasks.map((task) => (
            <BoardTask
              key={task.id}
              task={task}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
