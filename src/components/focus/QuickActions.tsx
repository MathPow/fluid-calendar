"use client";

import { useState } from "react";

import { Clock, Pencil, Trash2 } from "lucide-react";

import { TaskModal } from "@/components/tasks/TaskModal";
import { Button } from "@/components/ui/button";

import { useT } from "@/i18n/client";
import { logger } from "@/lib/logger";

import { useFocusModeStore } from "@/store/focusMode";
import { useTaskStore } from "@/store/task";

import { NewTask } from "@/types/task";

export function QuickActions() {
  const t = useT();
  const { completeCurrentTask, postponeTask, getCurrentTask } =
    useFocusModeStore();
  const { updateTask, deleteTask, fetchTasks, tags, createTag } =
    useTaskStore();
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  const currentTask = getCurrentTask();

  const handleEditTask = async (taskData: NewTask) => {
    if (!currentTask) return;

    try {
      await updateTask(currentTask.id, taskData);
      await fetchTasks();
      setIsEditModalOpen(false);
    } catch (error) {
      logger.error("Failed to update task in focus mode", {
        error: error instanceof Error ? error.message : String(error),
        taskId: currentTask.id,
      });
    }
  };

  const handleDeleteTask = async () => {
    if (!currentTask) return;

    if (confirm(t("tasks.confirm.delete"))) {
      try {
        await deleteTask(currentTask.id);
        await fetchTasks();
      } catch (error) {
        logger.error("Failed to delete task in focus mode", {
          error: error instanceof Error ? error.message : String(error),
          taskId: currentTask.id,
        });
      }
    }
  };

  return (
    <div className="flex flex-col space-y-4 p-4">
      <h2 className="text-lg font-semibold">{t("focus.quickActions.title")}</h2>

      <div className="flex flex-col space-y-2">
        {/* Complete Task */}
        <Button
          variant="outline"
          onClick={() => completeCurrentTask()}
          className="justify-start"
          disabled={!currentTask}
        >
          <span className="flex items-center">
            <span className="mr-2">✅</span>
            {t("focus.quickActions.complete")}
          </span>
        </Button>

        {/* Edit Task */}
        <Button
          variant="outline"
          onClick={() => setIsEditModalOpen(true)}
          className="justify-start"
          disabled={!currentTask}
        >
          <span className="flex items-center">
            <Pencil className="mr-2 h-4 w-4" />
            {t("focus.quickActions.edit")}
          </span>
        </Button>

        {/* Delete Task */}
        <Button
          variant="outline"
          onClick={handleDeleteTask}
          className="justify-start text-destructive hover:text-destructive"
          disabled={!currentTask}
        >
          <span className="flex items-center">
            <Trash2 className="mr-2 h-4 w-4" />
            {t("focus.quickActions.delete")}
          </span>
        </Button>

        <div className="my-2 h-px bg-border" />
        <h3 className="text-sm font-medium">{t("focus.quickActions.postpone")}</h3>

        {/* Postpone Actions */}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => postponeTask("1h")}
            className="flex items-center"
            disabled={!currentTask}
          >
            <Clock className="mr-1 h-3 w-3" /> {t("focus.quickActions.oneHour")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => postponeTask("3h")}
            className="flex items-center"
            disabled={!currentTask}
          >
            <Clock className="mr-1 h-3 w-3" /> {t("focus.quickActions.threeHours")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => postponeTask("1d")}
            className="flex items-center"
            disabled={!currentTask}
          >
            <Clock className="mr-1 h-3 w-3" /> {t("focus.quickActions.oneDay")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => postponeTask("1w")}
            className="flex items-center"
            disabled={!currentTask}
          >
            <Clock className="mr-1 h-3 w-3" /> {t("focus.quickActions.oneWeek")}
          </Button>
        </div>
      </div>

      {/* Task Edit Modal */}
      {currentTask && (
        <TaskModal
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          onSave={handleEditTask}
          task={currentTask}
          tags={tags}
          onCreateTag={(name, color) => createTag({ name, color: color || "" })}
        />
      )}
    </div>
  );
}
