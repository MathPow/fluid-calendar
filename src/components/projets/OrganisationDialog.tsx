"use client";

import { useEffect, useState } from "react";

import { useRouter } from "next/navigation";

import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import {
  DEFAULT_PROJECT_COLOR,
  ORG_KINDS,
  type OrgKind,
} from "@/lib/projets/meta";
import type { OrganisationLite } from "@/lib/projets/queries";
import { cn } from "@/lib/utils";

import { ColorField } from "./ColorField";
import { ImageField } from "./ImageField";
import {
  type FormLink,
  LinksEditor,
  toFormLinks,
  toLinkPayload,
} from "./LinksEditor";

interface OrganisationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organisation?: OrganisationLite | null;
}

/** Create / edit an organisation: name, colour, type, description, links. */
export function OrganisationDialog({
  open,
  onOpenChange,
  organisation,
}: OrganisationDialogProps) {
  const router = useRouter();
  const editing = !!organisation;

  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(DEFAULT_PROJECT_COLOR);
  const [image, setImage] = useState<string | null>(null);
  const [kind, setKind] = useState<OrgKind>("client");
  const [description, setDescription] = useState("");
  const [links, setLinks] = useState<FormLink[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(organisation?.name ?? "");
    setColor(organisation?.color ?? DEFAULT_PROJECT_COLOR);
    setImage(organisation?.image ?? null);
    setKind(
      (ORG_KINDS.some((k) => k.id === organisation?.kind)
        ? organisation?.kind
        : "client") as OrgKind
    );
    setDescription(organisation?.description ?? "");
    setLinks(toFormLinks(organisation?.links ?? []));
  }, [open, organisation]);

  const submit = async () => {
    if (!name.trim()) {
      toast.error("Donne un nom à l'organisation.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(
        editing
          ? `/api/organisations/${organisation!.id}`
          : "/api/organisations",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            color,
            image,
            kind,
            description: description.trim() || null,
            links: toLinkPayload(links),
          }),
        }
      );
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
      toast.success(
        editing ? "Organisation mise à jour." : "Organisation créée."
      );
      onOpenChange(false);
      router.refresh();
    } catch (e) {
      toast.error("Enregistrement impossible", {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async () => {
    if (!organisation) return;
    const n = organisation._count.projects;
    const ok = window.confirm(
      `Supprimer « ${organisation.name} » ?${
        n > 0
          ? ` Ses ${n} projet${n > 1 ? "s" : ""} retomberont dans Perso.`
          : ""
      }`
    );
    if (!ok) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/organisations/${organisation.id}`, {
        method: "DELETE",
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
      toast.success("Organisation supprimée.");
      onOpenChange(false);
      router.refresh();
    } catch (e) {
      toast.error("Suppression impossible", {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex flex-col gap-0 overflow-y-hidden p-0 md:p-0 max-w-2xl">
        <DialogHeader className="space-y-1.5 px-6 pb-4 pt-6 md:px-8 md:pt-8">
          <DialogTitle>
            {editing ? "Modifier l'organisation" : "Nouvelle organisation"}
          </DialogTitle>
          <DialogDescription>
            Une entreprise ou une marque qui regroupe plusieurs projets, comme
            DehorsQC ou StayChum.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 pb-6 md:px-8 md:pb-8">
        <form
          id="org-form"
          className="space-y-6"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <ImageField
            value={image}
            onChange={setImage}
            fallback={name.trim() ? name.trim().charAt(0).toUpperCase() : "?"}
            color={color}
            shape="rounded"
            label="Logo"
          />

          <div className="space-y-2">
            <Label htmlFor="org-name">Nom</Label>
            <Input
              id="org-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="DehorsQC"
              autoFocus
              className="text-[17px] font-semibold tracking-title"
            />
          </div>

          <div className="space-y-2">
            <Label>Type</Label>
            <div className="grid gap-2 sm:grid-cols-3">
              {ORG_KINDS.map((k) => {
                const active = kind === k.id;
                return (
                  <button
                    key={k.id}
                    type="button"
                    onClick={() => setKind(k.id)}
                    aria-pressed={active}
                    className={cn(
                      "rounded-2xl border-2 px-4 py-3 text-left transition-colors",
                      active
                        ? "border-foreground bg-tint-soft"
                        : "border-transparent bg-secondary hover:bg-border/70"
                    )}
                  >
                    <span className="block text-[14px] font-semibold tracking-title">
                      {k.label}
                    </span>
                    <span className="block text-[12px] text-muted-foreground">
                      {k.hint}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="text-[12px] text-muted-foreground">
              Perso compte dans le filtre Personal de l&apos;en-tête; les deux
              autres dans Work.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Couleur</Label>
            <ColorField value={color} onChange={setColor} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="org-description">Description</Label>
            <Textarea
              id="org-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="En une phrase, ce que fait cette organisation."
              rows={2}
            />
          </div>

          <LinksEditor
            links={links}
            onChange={setLinks}
            hint="Site web, Instagram, Drive, tableau de bord Stripe…"
          />

        </form>
        </div>

        <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-border bg-card px-6 py-4 md:px-8 sm:flex-row sm:items-center">
            {editing && !organisation?.isDefault && (
              <Button
                type="button"
                variant="ghost"
                className="text-negative-foreground hover:bg-negative hover:text-negative-foreground sm:mr-auto"
                onClick={remove}
                disabled={submitting}
              >
                <Trash2 /> Supprimer
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
              className="sm:ml-auto"
            >
              Annuler
            </Button>
            <Button type="submit" form="org-form" disabled={submitting}>
              {submitting
                ? "Enregistrement…"
                : editing
                  ? "Enregistrer"
                  : "Créer"}
            </Button>
          </div>
      </DialogContent>
    </Dialog>
  );
}
