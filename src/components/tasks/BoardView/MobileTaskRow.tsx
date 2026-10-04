"use client";

import { useRef } from "react";

import { Check, Trash2 } from "lucide-react";

import { Task, TaskStatus } from "@/types/task";

export function MobileTaskRow({
  task,
  onEdit,
  onDelete,
  onStatusChange,
}: {
  task: Task;
  onEdit: (task: Task) => void;
  onDelete: (id: string) => void;
  onStatusChange: (id: string, status: TaskStatus) => void;
}) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);
  // The caller owns the confirmation and persistence, including fetch/error handling.
  const remove = () => onDelete(task.id);
  return (
    <div
      className="flex items-center gap-1 rounded-xl border border-border bg-card p-1"
      onClickCapture={(e) => {
        if (swiped.current) {
          e.preventDefault();
          e.stopPropagation();
          swiped.current = false;
        }
      }}
      onTouchStart={(e) => {
        if (
          e.touches.length !== 1 ||
          (e.target as HTMLElement).closest("[data-row-action]")
        ) {
          start.current = null;
          return;
        }
        const t = e.touches[0];
        start.current = { x: t.clientX, y: t.clientY };
        swiped.current = false;
      }}
      onTouchMove={(e) => {
        const s = start.current;
        if (
          e.touches.length !== 1 ||
          (s && Math.abs(e.touches[0].clientY - s.y) >= 40)
        )
          start.current = null;
      }}
      onTouchCancel={() => {
        start.current = null;
      }}
      onTouchEnd={(e) => {
        const s = start.current;
        start.current = null;
        if (!s) return;
        const t = e.changedTouches[0];
        const dx = t.clientX - s.x;
        if (Math.abs(dx) > 80 && Math.abs(t.clientY - s.y) < 40) {
          swiped.current = true;
          if (dx > 0) {
            if (task.status !== TaskStatus.COMPLETED)
              onStatusChange(task.id, TaskStatus.COMPLETED);
          } else remove();
        }
      }}
    >
      <button
        type="button"
        className="min-h-12 min-w-0 flex-1 px-2 text-left"
        onClick={() => {
          if (swiped.current) {
            swiped.current = false;
            return;
          }
          onEdit(task);
        }}
      >
        <span className="block truncate text-sm font-medium">{task.title}</span>
        {task.project && (
          <span className="block truncate text-xs text-muted-foreground">
            {task.project.name}
          </span>
        )}
      </button>
      <button
        type="button"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary"
        data-row-action
        aria-label={`Terminer ${task.title}`}
        onClick={() => onStatusChange(task.id, TaskStatus.COMPLETED)}
        disabled={task.status === TaskStatus.COMPLETED}
      >
        <Check className="h-4 w-4" />
      </button>
      <button
        type="button"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-destructive"
        data-row-action
        aria-label={`Supprimer ${task.title}`}
        onClick={remove}
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}
