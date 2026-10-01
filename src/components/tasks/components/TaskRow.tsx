import {
  Check,
  Clock,
  Cloud,
  Lock,
  Menu,
  Pencil,
  RefreshCw,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";

import { useT } from "@/i18n/client";
import { format, isFutureDate, newDate } from "@/lib/date-utils";
import { cn } from "@/lib/utils";

import { Task, TaskStatus } from "@/types/task";

import { useDraggableTask } from "../../dnd/useDragAndDrop";
import { statusColors } from "../utils/task-list-utils";
import { StepsProgress } from "./StepsEditor";
import { EditableCell } from "./EditableCell";

interface TaskRowProps {
  task: Task;
  onEdit: (task: Task) => void;
  onDelete: (taskId: string) => void;
  onStatusChange: (taskId: string, status: TaskStatus) => void;
  onInlineEdit: (task: Task) => void;
}

export function TaskRow({
  task,
  onEdit,
  onDelete,
  onStatusChange,
  onInlineEdit,
}: TaskRowProps) {
  const t = useT();
  const { draggableProps, isDragging } = useDraggableTask(task);
  const isFutureTask = task.startDate && isFutureDate(task.startDate);

  return (
    <tr
      key={task.id}
      className={cn(
        "transition-colors hover:bg-muted/50",
        isDragging ? "opacity-50" : "",
        isFutureTask ? "bg-muted/25 text-muted-foreground" : ""
      )}
    >
      <td className="px-3 py-2">
        <div
          className="cursor-grab text-muted-foreground hover:text-foreground"
          {...draggableProps}
          onClick={(e) => e.stopPropagation()}
        >
          <Menu className="h-4 w-4" />
        </div>
      </td>
      <td className="whitespace-nowrap px-3 py-2">
        <div className="flex items-center gap-2">
          <Select
            value={task.status}
            onValueChange={(value) => {
              onStatusChange(task.id, value as TaskStatus);
            }}
            onOpenChange={(open) => {
              if (open) {
                // Prevent opening the task modal when clicking the select
                document.body.classList.add("status-select-open");
              } else {
                // Remove the class after a short delay to allow the click event to be processed
                setTimeout(() => {
                  document.body.classList.remove("status-select-open");
                }, 100);
              }
            }}
          >
            <SelectTrigger
              className="h-8 border-none bg-transparent p-0 shadow-none hover:bg-transparent focus:ring-0"
              onClick={(e) => e.stopPropagation()}
            >
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-xs font-medium",
                  statusColors[task.status]
                )}
              >
                {t(`tasks.status.${task.status}`)}
              </span>
            </SelectTrigger>
            <SelectContent>
              {Object.values(TaskStatus).map((status) => (
                <SelectItem key={status} value={status}>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-xs font-medium",
                      statusColors[status]
                    )}
                  >
                    {t(`tasks.status.${status}`)}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="ghost"
            className={cn(
              "h-8 w-8 p-1",
              task.status === TaskStatus.COMPLETED
                ? "bg-positive text-positive-foreground hover:bg-positive/80"
                : "text-muted-foreground hover:bg-secondary hover:text-positive-foreground"
            )}
            onClick={(e) => {
              e.stopPropagation();
              onStatusChange(
                task.id,
                task.status === TaskStatus.COMPLETED
                  ? TaskStatus.TODO
                  : TaskStatus.COMPLETED
              );
            }}
            title={
              task.status === TaskStatus.COMPLETED
                ? t("tasks.row.markTodo")
                : t("tasks.row.markCompleted")
            }
          >
            <Check className="h-5 w-5" />
          </Button>
        </div>
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          <EditableCell
            task={task}
            field="title"
            value={task.title}
            onSave={onInlineEdit}
          />

          <StepsProgress steps={task.steps} />

          {isFutureTask && (
            <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
              {t("tasks.row.upcoming")}
            </span>
          )}

          {task.isRecurring && (
            <RefreshCw className="h-4 w-4 shrink-0 text-muted-foreground">
              <title>{t("tasks.row.recurring")}</title>
            </RefreshCw>
          )}
          {task.isAutoScheduled && (
            <Clock className="h-4 w-4 shrink-0 text-muted-foreground">
              <title>{t("tasks.row.autoScheduled")}</title>
            </Clock>
          )}
          {task.scheduleLocked && (
            <Lock className="h-4 w-4 shrink-0 text-pending-foreground">
              <title>{t("tasks.row.scheduleLocked")}</title>
            </Lock>
          )}
          {task.externalTaskId && (
            <Cloud className="h-4 w-4 shrink-0 text-muted-foreground">
              <title>{t("tasks.row.syncedFrom", { source: task.source ?? "" })}</title>
            </Cloud>
          )}
        </div>
      </td>
      <td className="whitespace-nowrap px-3 py-2">
        <EditableCell
          task={task}
          field="priority"
          value={task.priority}
          onSave={onInlineEdit}
        />
      </td>
      <td className="whitespace-nowrap px-3 py-2">
        <EditableCell
          task={task}
          field="energyLevel"
          value={task.energyLevel}
          onSave={onInlineEdit}
        />
      </td>
      <td className="whitespace-nowrap px-3 py-2">
        <EditableCell
          task={task}
          field="preferredTime"
          value={task.preferredTime}
          onSave={onInlineEdit}
        />
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-sm text-muted-foreground">
        <EditableCell
          task={task}
          field="dueDate"
          value={task.dueDate}
          onSave={onInlineEdit}
        />
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-sm text-muted-foreground">
        <EditableCell
          task={task}
          field="duration"
          value={task.duration}
          onSave={onInlineEdit}
        />
      </td>
      <td className="whitespace-nowrap px-3 py-2">
        <EditableCell
          task={task}
          field="projectId"
          value={task.projectId}
          onSave={onInlineEdit}
        />
      </td>
      <td className="whitespace-nowrap px-3 py-2">
        <div className="flex items-center gap-2">
          {task.isAutoScheduled ? (
            <div className="flex items-center gap-1">
              <Clock className="h-4 w-4 text-primary">
                <title>{t("tasks.row.autoScheduled")}</title>
              </Clock>
              {task.scheduleLocked && (
                <Lock className="h-3 w-3 text-primary">
                  <title>{t("tasks.row.scheduleLocked")}</title>
                </Lock>
              )}
              {task.scheduledStart && task.scheduledEnd && (
                <span className="text-sm text-primary">
                  {format(newDate(task.scheduledStart), "MMM d, p")} -{" "}
                  {format(newDate(task.scheduledEnd), "p")}
                  {task.scheduleScore && (
                    <span className="ml-1 text-primary/70">
                      ({Math.round(task.scheduleScore * 100)}%)
                    </span>
                  )}
                </span>
              )}
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">{t("tasks.row.manual")}</span>
          )}
        </div>
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-sm text-muted-foreground">
        <EditableCell
          task={task}
          field="startDate"
          value={task.startDate}
          onSave={onInlineEdit}
        />
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-right text-sm font-medium">
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-1 text-muted-foreground hover:bg-muted hover:text-primary"
            onClick={(e) => {
              e.stopPropagation();
              onEdit(task);
            }}
            title={t("tasks.row.edit")}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(task.id);
            }}
            title={t("tasks.row.delete")}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </td>
    </tr>
  );
}
