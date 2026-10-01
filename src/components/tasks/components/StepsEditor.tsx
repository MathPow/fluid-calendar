"use client";

import { useState } from "react";

import { GripVertical, Plus, X } from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";

import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";

import type { TaskStepInput } from "@/types/task";

interface StepsEditorProps {
  steps: TaskStepInput[];
  onChange: (steps: TaskStepInput[]) => void;
}

/**
 * Checklist editor inside the task dialog: tick, retitle, remove, reorder
 * (drag handle: move up/down with the arrow keys), add with Enter.
 */
export function StepsEditor({ steps, onChange }: StepsEditorProps) {
  const t = useT();
  const [draft, setDraft] = useState("");

  const done = steps.filter((s) => s.done).length;

  const add = () => {
    const title = draft.trim();
    if (!title) return;
    onChange([...steps, { title, done: false }]);
    setDraft("");
  };

  const update = (i: number, patch: Partial<TaskStepInput>) =>
    onChange(steps.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  const remove = (i: number) => onChange(steps.filter((_, j) => j !== i));

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= steps.length) return;
    const next = [...steps];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <div className="space-y-2">
      {steps.length > 0 && (
        <div className="flex items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-positive-foreground transition-[width]"
              style={{ width: `${Math.round((done / steps.length) * 100)}%` }}
            />
          </div>
          <span className="text-[12px] tabular-nums text-muted-foreground">
            {done}/{steps.length}
          </span>
        </div>
      )}

      <ul className="space-y-1">
        {steps.map((s, i) => (
          <li
            key={s.id ?? `new-${i}`}
            className="group flex items-center gap-2 rounded-xl bg-secondary/60 px-2 py-1"
          >
            <button
              type="button"
              className="cursor-ns-resize rounded p-0.5 text-muted-foreground/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              title={t("tasks.steps.moveTitle")}
              aria-label={t("tasks.steps.moveAria", { index: i + 1 })}
              onKeyDown={(e) => {
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  move(i, -1);
                } else if (e.key === "ArrowDown") {
                  e.preventDefault();
                  move(i, 1);
                }
              }}
            >
              <GripVertical className="h-4 w-4" />
            </button>
            <Checkbox
              checked={!!s.done}
              onCheckedChange={(v) => update(i, { done: v === true })}
              aria-label={t("tasks.steps.doneAria", { index: i + 1 })}
            />
            <input
              value={s.title}
              onChange={(e) => update(i, { title: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  add();
                }
              }}
              className={cn(
                "h-8 min-w-0 flex-1 border-0 bg-transparent p-0 text-[14px] text-foreground focus:outline-none focus:ring-0",
                s.done && "text-muted-foreground line-through"
              )}
              aria-label={t("tasks.steps.titleAria", { index: i + 1 })}
            />
            <button
              type="button"
              onClick={() => remove(i)}
              className="rounded-full p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-negative hover:text-negative-foreground focus-visible:opacity-100 group-hover:opacity-100"
              aria-label={t("tasks.steps.removeAria", { index: i + 1 })}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
      </ul>

      <div className="flex items-center gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder={
            steps.length === 0
              ? t("tasks.steps.firstPlaceholder")
              : t("tasks.steps.nextPlaceholder")
          }
          className="h-10"
        />
        <button
          type="button"
          onClick={add}
          disabled={!draft.trim()}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary text-foreground transition-colors hover:bg-border/70 disabled:opacity-40"
          aria-label={t("tasks.steps.addAria")}
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

/** Small "2/5" progress chip for lists and cards. */
export function StepsProgress({
  steps,
  className,
}: {
  steps: { done: boolean }[] | undefined;
  className?: string;
}) {
  const t = useT();
  if (!steps || steps.length === 0) return null;
  const done = steps.filter((s) => s.done).length;
  const complete = done === steps.length;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums",
        complete ? "bg-positive text-positive-foreground" : "bg-secondary text-muted-foreground",
        className
      )}
      title={t("tasks.steps.progressTitle", { done, total: steps.length })}
    >
      <span className="h-1 w-8 overflow-hidden rounded-full bg-foreground/10">
        <span
          className={cn("block h-full rounded-full", complete ? "bg-positive-foreground" : "bg-foreground/50")}
          style={{ width: `${Math.round((done / steps.length) * 100)}%` }}
        />
      </span>
      {done}/{steps.length}
    </span>
  );
}
