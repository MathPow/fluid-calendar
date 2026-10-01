"use client";

import { useRef } from "react";

import { Check, Trash2 } from "lucide-react";

import { useT } from "@/i18n/client";

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
  const t = useT();
  const start = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);
  // The caller owns the confirmation and persistence, including fetch/error handling.
  const remove = () => onDelete(task.id);
  return (
    <div
      className="flex items-center gap-1 rounded-xl border border-border bg-card p-1"
      onTouchStart={(e) => {
        const touch = e.touches[0];
        start.current = { x: touch.clientX, y: touch.clientY };
        swiped.current = false;
      }}
      onTouchCancel={() => {
        start.current = null;
      }}
      onTouchEnd={(e) => {
        const s = start.current;
        start.current = null;
        if (!s) return;
        const touch = e.changedTouches[0];
        const dx = touch.clientX - s.x;
        if (Math.abs(dx) > 80 && Math.abs(touch.clientY - s.y) < 40) {
          swiped.current = true;
          if (dx > 0) onStatusChange(task.id, TaskStatus.COMPLETED);
          else remove();
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
        aria-label={t("tasks.mobile.completeAria", { title: task.title })}
        onClick={() => onStatusChange(task.id, TaskStatus.COMPLETED)}
        disabled={task.status === TaskStatus.COMPLETED}
      >
        <Check className="h-4 w-4" />
      </button>
      <button
        type="button"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-destructive"
        aria-label={t("tasks.mobile.deleteAria", { title: task.title })}
        onClick={remove}
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}
