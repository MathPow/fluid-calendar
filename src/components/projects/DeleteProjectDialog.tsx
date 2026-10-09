"use client";

import { useState } from "react";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { useT } from "@/i18n";

import { useProjectStore } from "@/store/project";

import { Project } from "@/types/project";

interface DeleteProjectDialogProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project;
  taskCount: number;
}

export function DeleteProjectDialog({
  isOpen,
  onClose,
  project,
  taskCount,
}: DeleteProjectDialogProps) {
  const t = useT();
  const { deleteProject } = useProjectStore();
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteProject(project.id);
      onClose();
      project.onClose?.();
    } catch (error) {
      console.error("Error deleting project:", error);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={onClose}>
      <Dialog.Portal>
        <Dialog.Overlay className="data-[state=open]:animate-overlayShow fixed inset-0 z-[60] bg-black/50" />
        <Dialog.Content className="data-[state=open]:animate-contentShow fixed left-[50%] top-[50%] z-[61] max-h-[85vh] w-[90vw] max-w-[450px] translate-x-[-50%] translate-y-[-50%] rounded-[28px] bg-card p-7 shadow-float focus:outline-none">
          <Dialog.Title className="m-0 text-[17px] font-medium">
            {t("projectModal.delete.title")}
          </Dialog.Title>
          <Dialog.Description className="mb-5 mt-4 text-[15px] leading-normal">
            <p className="mb-3">
              {t("projectModal.delete.confirmPrefix")}{" "}
              <strong>{project.name}</strong>
              {t("projectModal.delete.confirmSuffix")}
            </p>
            <p className="mb-3 font-bold text-negative-foreground">
              {t("projectModal.delete.warning")}
            </p>
            {taskCount > 0 && (
              <p className="text-negative-foreground">
                {t("projectModal.delete.taskCount", { count: taskCount })}
              </p>
            )}
          </Dialog.Description>

          <div className="mt-6 flex justify-end gap-4">
            <button
              className="inline-flex h-10 items-center justify-center rounded-full bg-secondary px-5 text-[14px] font-semibold leading-none outline-none hover:bg-border focus-visible:ring-2 focus-visible:ring-ring"
              onClick={onClose}
              disabled={isDeleting}
            >
              {t("common.cancel")}
            </button>
            <button
              className="inline-flex h-10 items-center justify-center rounded-full bg-destructive px-5 text-[14px] font-semibold leading-none text-destructive-foreground outline-none hover:bg-destructive/90 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting
                ? t("projectModal.delete.deleting")
                : t("projectModal.delete")}
            </button>
          </div>

          <Dialog.Close asChild>
            <button
              className="absolute right-5 top-5 inline-flex h-9 w-9 appearance-none items-center justify-center rounded-full bg-secondary text-muted-foreground hover:bg-border hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={t("common.close")}
              disabled={isDeleting}
            >
              <X />
            </button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
