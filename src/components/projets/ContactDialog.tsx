"use client";

import { useEffect, useState } from "react";

import { useRouter } from "next/navigation";

import { Star, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import { cn } from "@/lib/utils";

import { DEFAULT_PROJECT_COLOR, RELATION_KINDS, initials } from "@/lib/projets/meta";
import type { ContactFull } from "@/lib/projets/queries";

import { ImageField } from "./ImageField";
import type { ProjectLite } from "./ProjectDialog";

interface ContactDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact?: ContactFull | null;
  projects: ProjectLite[];
}

export function ContactDialog({ open, onOpenChange, contact, projects }: ContactDialogProps) {
  const router = useRouter();
  const editing = !!contact;

  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const NO_RELATION = "__none__";
  const [relation, setRelation] = useState<string>(NO_RELATION);
  const [relationDetail, setRelationDetail] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [favorite, setFavorite] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(contact?.name ?? "");
    setCompany(contact?.company ?? "");
    setRole(contact?.role ?? "");
    setRelation(contact?.relation ?? NO_RELATION);
    setRelationDetail(contact?.relationDetail ?? "");
    setImage(contact?.image ?? null);
    setFavorite(contact?.favorite ?? false);
    setTags(contact?.tags ?? []);
    setTagDraft("");
    setEmail(contact?.email ?? "");
    setPhone(contact?.phone ?? "");
    setNotes(contact?.notes ?? "");
    setProjectIds(contact?.projects.map((p) => p.projectId) ?? []);
  }, [open, contact]);

  const addTags = () => {
    const parts = tagDraft
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!parts.length) return;
    setTags((prev) => Array.from(new Set([...prev, ...parts])).slice(0, 50));
    setTagDraft("");
  };

  const toggleProject = (id: string, on: boolean) =>
    setProjectIds((prev) =>
      on ? Array.from(new Set([...prev, id])) : prev.filter((x) => x !== id)
    );

  const submit = async () => {
    if (!name.trim()) {
      toast.error("Donne un nom au contact.");
      return;
    }
    const finalTags = tagDraft.trim()
      ? Array.from(new Set([...tags, ...tagDraft.split(/[,\n]/).map((s) => s.trim()).filter(Boolean)]))
      : tags;
    setSubmitting(true);
    try {
      const res = await fetch(editing ? `/api/contacts/${contact!.id}` : "/api/contacts", {
        method: editing ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          company: company.trim() || null,
          role: role.trim() || null,
          relation: relation === NO_RELATION ? null : relation,
          relationDetail: relationDetail.trim() || null,
          image,
          favorite,
          tags: finalTags,
          email: email.trim() || null,
          phone: phone.trim() || null,
          notes: notes.trim() || null,
          projectIds,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        details?: { fieldErrors?: Record<string, string[]> };
      };
      if (!res.ok) {
        const fieldMsg = data.details?.fieldErrors
          ? Object.values(data.details.fieldErrors).flat()[0]
          : undefined;
        throw new Error(fieldMsg || data.error || `Erreur ${res.status}`);
      }
      toast.success(editing ? "Contact mis à jour." : "Contact créé.");
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
    if (!contact) return;
    if (!window.confirm(`Supprimer « ${contact.name} » ?`)) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/contacts/${contact.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`Erreur ${res.status}`);
      toast.success("Contact supprimé.");
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
      <DialogContent className="max-h-[92vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Modifier le contact" : "Nouveau contact"}</DialogTitle>
          <DialogDescription>
            Un client, un collaborateur, un fournisseur — rattachable à plusieurs projets.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-6"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <ImageField
            value={image}
            onChange={setImage}
            fallback={name.trim() ? initials(name) : "?"}
            color="#a8ccff"
            label="Photo de profil"
          />

          <div className="space-y-2">
            <Label htmlFor="contact-name">Nom</Label>
            <div className="flex items-center gap-2">
              <Input
                id="contact-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Marie-Ève Tremblay"
                autoFocus
                className="text-[17px] font-semibold tracking-title"
              />
              <button
                type="button"
                onClick={() => setFavorite((v) => !v)}
                aria-pressed={favorite}
                title={favorite ? "Retirer des favoris" : "Mettre en favori"}
                className={cn(
                  "flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] transition-colors",
                  favorite
                    ? "bg-pending text-pending-foreground"
                    : "bg-input text-muted-foreground hover:text-foreground"
                )}
              >
                <Star className={cn("h-5 w-5", favorite && "fill-current")} />
              </button>
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="contact-company">Entreprise</Label>
              <Input
                id="contact-company"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="Studio Verve"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact-role">Job / catégorie</Label>
              <Input
                id="contact-role"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="Entrepreneur, Pro, Étudiant…"
              />
            </div>
            <div className="space-y-2">
              <Label>Relation</Label>
              <Select value={relation} onValueChange={setRelation}>
                <SelectTrigger>
                  <SelectValue placeholder="Choisir…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_RELATION}>Non précisée</SelectItem>
                  {RELATION_KINDS.map((k) => (
                    <SelectItem key={k.id} value={k.id}>
                      {k.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact-relation-detail">Précision</Label>
              <Input
                id="contact-relation-detail"
                value={relationDetail}
                onChange={(e) => setRelationDetail(e.target.value)}
                placeholder="Beau-père de Félix-Antoine, classe au cégep…"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact-email">Courriel</Label>
              <Input
                id="contact-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="marie@studioverve.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact-phone">Téléphone</Label>
              <Input
                id="contact-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="514 555-0199"
              />
            </div>
          </div>

          <div className="space-y-3">
            <Label htmlFor="contact-tags">Mots-clés privés</Label>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {tags.map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center gap-1 rounded-full bg-secondary py-1 pl-3 pr-1.5 text-[13px] font-medium"
                  >
                    {t}
                    <button
                      type="button"
                      onClick={() => setTags((prev) => prev.filter((x) => x !== t))}
                      className="rounded-full p-0.5 text-muted-foreground hover:bg-card hover:text-foreground"
                      aria-label={`Retirer ${t}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <Input
              id="contact-tags"
              value={tagDraft}
              onChange={(e) => setTagDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  addTags();
                }
              }}
              onBlur={addTags}
              placeholder="tristan clientèle, podcast, lévis… (Entrée pour ajouter)"
            />
            <p className="text-[12px] text-muted-foreground">
              Pour toi seulement : des repères que la recherche retrouve, sans être affichés en
              grand sur la fiche.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="contact-notes">Notes</Label>
            <Textarea
              id="contact-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Préférences, contexte, ce qu'il faut se rappeler."
              rows={3}
            />
          </div>

          <div className="space-y-3">
            <Label>Projets</Label>
            {projects.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">Aucun projet à rattacher.</p>
            ) : (
              <ul className="max-h-52 divide-y divide-border overflow-y-auto rounded-2xl bg-secondary/60 px-3">
                {projects.map((p) => (
                  <li key={p.id}>
                    <label className="flex cursor-pointer items-center gap-3 py-2.5">
                      <Checkbox
                        checked={projectIds.includes(p.id)}
                        onCheckedChange={(v) => toggleProject(p.id, v === true)}
                      />
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: p.color ?? DEFAULT_PROJECT_COLOR }}
                      />
                      <span className="min-w-0 flex-1 truncate text-[14px]">
                        {p.name}
                        {p.parentId && (
                          <span className="text-muted-foreground">
                            {" "}
                            · {projects.find((x) => x.id === p.parentId)?.name}
                          </span>
                        )}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex flex-col-reverse gap-2 border-t border-border pt-5 sm:flex-row sm:items-center">
            {editing && (
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
            <Button type="submit" disabled={submitting}>
              {submitting ? "Enregistrement…" : editing ? "Enregistrer" : "Créer le contact"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
