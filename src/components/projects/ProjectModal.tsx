"use client";

import { useEffect, useState } from "react";

import { useT } from "@/i18n";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingOverlay } from "@/components/ui/loading-overlay";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import { useProjectStore } from "@/store/project";
import { useOrganisationsStore } from "@/store/organisations";

import { Project, ProjectStatus } from "@/types/project";

import { DeleteProjectDialog } from "./DeleteProjectDialog";
import { useLinkOptions } from "./ProjectPicker";

const NO_LINK = "__none__";

interface ProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  project?: Project;
}

export function ProjectModal({ isOpen, onClose, project }: ProjectModalProps) {
  const t = useT();
  const { createProject, updateProject } = useProjectStore();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("#E5E7EB");
  const [agentProjectId, setAgentProjectId] = useState<string>(NO_LINK);
  // Organisation of a list not linked to a Projets project.
  const [organisationId, setOrganisationId] = useState<string>(NO_LINK);
  const { organisations, load: loadOrganisations } = useOrganisationsStore();
  useEffect(() => {
    if (isOpen) loadOrganisations();
  }, [isOpen, loadOrganisations]);
  const { options } = useLinkOptions(isOpen);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  useEffect(() => {
    if (project && isOpen) {
      setName(project.name);
      setDescription(project.description || "");
      setColor(project.color || "#E5E7EB");
      setAgentProjectId(project.agentProjectId ?? NO_LINK);
      setOrganisationId(project.organisationId ?? NO_LINK);
    } else if (!project && isOpen) {
      setAgentProjectId(NO_LINK);
      setOrganisationId(NO_LINK);
      setName("");
      setDescription("");
      setColor("#E5E7EB");
    }
  }, [project, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSubmitting(true);
    try {
      if (project) {
        await updateProject(project.id, {
          name: name.trim(),
          description: description.trim() || undefined,
          color: color === "#E5E7EB" ? undefined : color,
          agentProjectId: agentProjectId === NO_LINK ? null : agentProjectId,
          organisationId: organisationId === NO_LINK ? null : organisationId,
        });
      } else {
        await createProject({
          name: name.trim(),
          description: description.trim() || undefined,
          color: color === "#E5E7EB" ? undefined : color,
          status: ProjectStatus.ACTIVE,
          agentProjectId: agentProjectId === NO_LINK ? null : agentProjectId,
          organisationId: organisationId === NO_LINK ? null : organisationId,
        });
      }
      onClose();
    } catch (error) {
      console.error("Error saving project:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-[450px]">
          {isSubmitting && <LoadingOverlay />}
          <DialogHeader>
            <DialogTitle>
              {project ? t("tasks.projectModal.title.edit") : t("tasks.projectModal.title.new")}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="name">{t("common.name")}</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div>
              <Label htmlFor="description">{t("common.description")}</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="min-h-[100px]"
              />
            </div>

            <div>
              <Label htmlFor="color">{t("common.color")}</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="color"
                  id="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="h-10 w-20 p-1"
                />
                <div
                  className="h-10 flex-1 rounded-md border"
                  style={{ backgroundColor: color }}
                />
              </div>
            </div>

            <div>
              <Label>{t("tasks.projectModal.linkedProject.label")}</Label>
              <Select value={agentProjectId} onValueChange={setAgentProjectId}>
                <SelectTrigger>
                  <SelectValue placeholder={t("common.none")} />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value={NO_LINK}>{t("common.none")}</SelectItem>
                  {(options?.projets ?? [])
                    .filter((p) => !p.taskProjectId || p.taskProjectId === project?.id)
                    .map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        <span className="inline-flex items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: p.color ?? "#a8ccff" }}
                          />
                          {p.name}
                          {p.organisation && (
                            <span className="text-muted-foreground">· {p.organisation.name}</span>
                          )}
                        </span>
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {agentProjectId !== NO_LINK && (
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {t("tasks.projectModal.linkedProject.hint")}
                </p>
              )}
            </div>

            {agentProjectId === NO_LINK && (
              <div>
                <Label>{t("tasks.projectModal.organisation.label")}</Label>
                <Select value={organisationId} onValueChange={setOrganisationId}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("tasks.projectModal.organisation.none")} />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    <SelectItem value={NO_LINK}>{t("tasks.projectModal.organisation.none")}</SelectItem>
                    {organisations.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        <span className="inline-flex items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: o.color ?? "#d9d4cc" }}
                          />
                          {o.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {t("tasks.projectModal.organisation.hint")}
                </p>
              </div>
            )}

            <div className="flex justify-between pt-4">
              {project && (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => setShowDeleteDialog(true)}
                  disabled={isSubmitting}
                >
                  {t("tasks.projectModal.delete")}
                </Button>
              )}
              <div className="ml-auto flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onClose}
                  disabled={isSubmitting}
                >
                  {t("common.cancel")}
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? t("common.saving") : t("tasks.projectModal.save")}
                </Button>
              </div>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {project && (
        <DeleteProjectDialog
          isOpen={showDeleteDialog}
          onClose={() => setShowDeleteDialog(false)}
          project={{ ...project, onClose }}
          taskCount={project._count?.tasks || 0}
        />
      )}
    </>
  );
}
