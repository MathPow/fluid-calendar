"use client";

import { useEffect, useMemo, useState } from "react";

import { useRouter } from "next/navigation";

import { Check, Plus, Trash2, X } from "lucide-react";
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

import {
  DEFAULT_PROJECT_COLOR,
  LINK_KINDS,
  type LinkKind,
  PROJECT_COLORS,
  PROJECT_STATIONS,
  type ProjectStation,
  guessLinkKind,
  normalizeUrl,
} from "@/lib/projets/meta";
import type { OrganisationLite, ProjectFull } from "@/lib/projets/queries";

import { ImageField } from "./ImageField";
import { LinkKindIcon } from "./link-icons";

export interface ProjectLite {
  id: string;
  name: string;
  slug: string;
  color: string | null;
  parentId: string | null;
  station: string;
  organisationId?: string | null;
}

export interface ContactLite {
  id: string;
  name: string;
  company: string | null;
  role: string | null;
  email: string | null;
}

interface FormLink {
  kind: LinkKind;
  label: string;
  url: string;
}

interface ProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Existing project to edit; omit to create. */
  project?: ProjectFull | null;
  /** Preselected parent when creating a sub-project. */
  parentId?: string | null;
  /** Preselected organisation when creating from an organisation's section. */
  organisationId?: string | null;
  projects: ProjectLite[];
  organisations: OrganisationLite[];
  contacts: ContactLite[];
}

const NO_PARENT = "__none__";
const DEFAULT_ORG = "__default__";

/**
 * Create / edit a project: name, colour, perso-vs-client, parent, links,
 * tools, contacts. Links and contacts are sent as full lists and replace the
 * previous ones server-side.
 */
export function ProjectDialog({
  open,
  onOpenChange,
  project,
  parentId,
  organisationId,
  projects,
  organisations,
  contacts: initialContacts,
}: ProjectDialogProps) {
  const router = useRouter();
  const editing = !!project;

  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(DEFAULT_PROJECT_COLOR);
  const [image, setImage] = useState<string | null>(null);
  const [station, setStation] = useState<ProjectStation>("personal");
  const [parent, setParent] = useState<string>(NO_PARENT);
  const [organisation, setOrganisation] = useState<string>(DEFAULT_ORG);
  const [description, setDescription] = useState("");
  const [path, setPath] = useState("");
  const [stack, setStack] = useState<string[]>([]);
  const [stackDraft, setStackDraft] = useState("");
  const [links, setLinks] = useState<FormLink[]>([]);
  const [contactIds, setContactIds] = useState<string[]>([]);
  const [contacts, setContacts] = useState<ContactLite[]>(initialContacts);
  const [newContactOpen, setNewContactOpen] = useState(false);
  const [newContactName, setNewContactName] = useState("");
  const [newContactEmail, setNewContactEmail] = useState("");
  const [creatingContact, setCreatingContact] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setContacts(initialContacts);
  }, [initialContacts]);

  // (Re)fill the form each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    if (project) {
      setName(project.name);
      setColor(project.color ?? DEFAULT_PROJECT_COLOR);
      setImage(project.image ?? null);
      setStation(project.station === "work" ? "work" : "personal");
      setParent(project.parentId ?? NO_PARENT);
      setOrganisation(project.organisationId ?? DEFAULT_ORG);
      setDescription(project.description ?? "");
      setPath(project.path ?? "");
      setStack(project.stack ?? []);
      setLinks(
        project.links.map((l) => ({
          kind: (LINK_KINDS.some((k) => k.id === l.kind) ? l.kind : "other") as LinkKind,
          label: l.label ?? "",
          url: l.url,
        }))
      );
      setContactIds(project.contacts.map((c) => c.contactId));
    } else {
      setName("");
      setColor(DEFAULT_PROJECT_COLOR);
      setImage(null);
      const parentProject = parentId ? projects.find((p) => p.id === parentId) : null;
      // A sub-project starts in its parent's station and colour.
      setStation(parentProject?.station === "work" ? "work" : "personal");
      setParent(parentId ?? NO_PARENT);
      // From an organisation's "+ Projet" button, or inherited from the parent.
      const preset = organisationId ?? parentProject?.organisationId ?? null;
      setOrganisation(preset ?? DEFAULT_ORG);
      const presetOrg = preset ? organisations.find((o) => o.id === preset) : null;
      if (presetOrg && !parentProject) setStation(presetOrg.station === "work" ? "work" : "personal");
      setColor(parentProject?.color ?? DEFAULT_PROJECT_COLOR);
      setDescription("");
      setPath("");
      setStack([]);
      setLinks([]);
      setContactIds([]);
    }
    setStackDraft("");
    setNewContactOpen(false);
    setNewContactName("");
    setNewContactEmail("");
  }, [open, project, parentId, organisationId, projects, organisations]);

  // A project can't be parented to itself or to one of its own children.
  const parentOptions = useMemo(() => {
    if (!project) return projects;
    const blocked = new Set<string>([project.id]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const p of projects) {
        if (p.parentId && blocked.has(p.parentId) && !blocked.has(p.id)) {
          blocked.add(p.id);
          grew = true;
        }
      }
    }
    return projects.filter((p) => !blocked.has(p.id));
  }, [project, projects]);

  const addStack = () => {
    const parts = stackDraft
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!parts.length) return;
    setStack((prev) => Array.from(new Set([...prev, ...parts])).slice(0, 30));
    setStackDraft("");
  };

  const updateLink = (i: number, patch: Partial<FormLink>) =>
    setLinks((prev) => prev.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  // Typing a Figma / Drive / GitHub… URL picks the matching kind unless the
  // user already chose a specific one.
  const updateLinkUrl = (i: number, url: string) =>
    setLinks((prev) =>
      prev.map((l, j) => {
        if (j !== i) return l;
        const guessed = guessLinkKind(url);
        const kind =
          guessed && (l.kind === "website" || l.kind === "other") ? guessed : l.kind;
        return { ...l, url, kind };
      })
    );

  const toggleContact = (id: string, on: boolean) =>
    setContactIds((prev) =>
      on ? Array.from(new Set([...prev, id])) : prev.filter((x) => x !== id)
    );

  const createContact = async () => {
    const n = newContactName.trim();
    if (!n) return;
    setCreatingContact(true);
    try {
      const res = await fetch("/api/contacts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: n, email: newContactEmail.trim() || null }),
      });
      if (!res.ok) throw new Error(`Erreur ${res.status}`);
      const c = (await res.json()) as ContactLite;
      setContacts((prev) => [...prev, c].sort((a, b) => a.name.localeCompare(b.name)));
      setContactIds((prev) => [...prev, c.id]);
      setNewContactName("");
      setNewContactEmail("");
      setNewContactOpen(false);
    } catch (e) {
      toast.error("Impossible de créer le contact", {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setCreatingContact(false);
    }
  };

  const submit = async () => {
    if (!name.trim()) {
      toast.error("Donne un nom au projet.");
      return;
    }
    const cleanLinks = links
      .map((l) => ({ ...l, url: normalizeUrl(l.url) }))
      .filter((l) => l.url);
    // Commit any tool still sitting in the draft field.
    const finalStack = stackDraft.trim()
      ? Array.from(new Set([...stack, ...stackDraft.split(/[,\n]/).map((s) => s.trim()).filter(Boolean)]))
      : stack;

    const body = {
      name: name.trim(),
      color,
      image,
      station,
      parentId: parent === NO_PARENT ? null : parent,
      organisationId: organisation === DEFAULT_ORG ? null : organisation,
      description: description.trim() || null,
      path: path.trim() || null,
      stack: finalStack,
      links: cleanLinks.map((l) => ({
        kind: l.kind,
        label: l.label.trim() || null,
        url: l.url,
      })),
      contacts: contactIds.map((contactId) => ({ contactId })),
    };

    setSubmitting(true);
    try {
      const res = await fetch(editing ? `/api/projets/${project!.id}` : "/api/projets", {
        method: editing ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        slug?: string;
        details?: { fieldErrors?: Record<string, string[]> };
      };
      if (!res.ok) {
        const fieldMsg = data.details?.fieldErrors
          ? Object.values(data.details.fieldErrors).flat()[0]
          : undefined;
        throw new Error(fieldMsg || data.error || `Erreur ${res.status}`);
      }
      toast.success(editing ? "Projet mis à jour." : "Projet créé.");
      onOpenChange(false);
      router.refresh();
      if (!editing && data.slug) router.push(`/projets/${encodeURIComponent(data.slug)}`);
    } catch (e) {
      toast.error("Enregistrement impossible", {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async () => {
    if (!project) return;
    const ok = window.confirm(
      `Supprimer « ${project.name} » ? Le journal d'activité sera perdu; les sous-projets sont conservés.`
    );
    if (!ok) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/projets/${project.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`Erreur ${res.status}`);
      toast.success("Projet supprimé.");
      onOpenChange(false);
      router.push("/projets");
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
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Modifier le projet" : "Nouveau projet"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Nom, couleur, liens, outils et contacts du projet."
              : "Un projet regroupe ses liens, ses outils, ses contacts et ses sous-projets."}
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-7"
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
            label="Logo du projet"
          />

          {/* Name + station */}
          <div className="grid gap-5 sm:grid-cols-[1fr_auto] sm:items-end">
            <div className="space-y-2">
              <Label htmlFor="project-name">Nom</Label>
              <Input
                id="project-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Dehors"
                autoFocus
                className="text-[17px] font-semibold tracking-title"
              />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <div className="segmented">
                {PROJECT_STATIONS.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className="segmented-item"
                    data-active={station === s.id}
                    onClick={() => setStation(s.id)}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Colour */}
          <div className="space-y-2">
            <Label>Couleur</Label>
            <div className="flex flex-wrap gap-2.5">
              {PROJECT_COLORS.map((c) => {
                const active = color.toLowerCase() === c.hex;
                return (
                  <button
                    key={c.hex}
                    type="button"
                    title={c.name}
                    onClick={() => setColor(c.hex)}
                    className={cn(
                      "flex h-11 w-14 items-center justify-center rounded-[14px] border-2 transition-transform hover:scale-105",
                      active ? "border-foreground" : "border-transparent"
                    )}
                    style={{ backgroundColor: c.hex }}
                    aria-pressed={active}
                  >
                    {active && <Check className="h-4 w-4 text-[#19181c]" strokeWidth={3} />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Organisation + parent + path */}
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Organisation</Label>
              <Select value={organisation} onValueChange={setOrganisation}>
                <SelectTrigger>
                  <SelectValue placeholder="Perso" />
                </SelectTrigger>
                <SelectContent>
                  {[...organisations]
                    .sort((a, b) => Number(a.isDefault) - Number(b.isDefault) || a.sortOrder - b.sortOrder)
                    .map((o) => (
                      <SelectItem key={o.id} value={o.isDefault ? DEFAULT_ORG : o.id}>
                        <span className="inline-flex items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: o.color ?? DEFAULT_PROJECT_COLOR }}
                          />
                          {o.name}
                          {o.isDefault && (
                            <span className="text-muted-foreground">· par défaut</span>
                          )}
                        </span>
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Projet parent</Label>
              <Select value={parent} onValueChange={setParent}>
                <SelectTrigger>
                  <SelectValue placeholder="Aucun" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_PARENT}>Aucun (projet principal)</SelectItem>
                  {parentOptions.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      <span className="inline-flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: p.color ?? DEFAULT_PROJECT_COLOR }}
                        />
                        {p.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="project-path">Dossier (repo)</Label>
              <Input
                id="project-path"
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder="~/repos/dehors"
                className="font-mono text-[13px]"
              />
            </div>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="project-description">Description</Label>
            <Textarea
              id="project-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="En une ou deux phrases, c'est quoi ce projet."
              rows={2}
            />
          </div>

          {/* Links */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Liens</Label>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() =>
                  setLinks((prev) => [...prev, { kind: "website", label: "", url: "" }])
                }
              >
                <Plus /> Ajouter un lien
              </Button>
            </div>
            {links.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">
                Figma, Drive, site web, projet Claude, GitHub…
              </p>
            ) : (
              <div className="space-y-2">
                {links.map((l, i) => (
                  <div
                    key={i}
                    className="grid gap-2 rounded-2xl bg-secondary/60 p-2 sm:grid-cols-[9.5rem_1fr_9rem_auto]"
                  >
                    <Select
                      value={l.kind}
                      onValueChange={(v) => updateLink(i, { kind: v as LinkKind })}
                    >
                      <SelectTrigger className="h-10 bg-card">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {LINK_KINDS.map((k) => (
                          <SelectItem key={k.id} value={k.id}>
                            <span className="inline-flex items-center gap-2">
                              <LinkKindIcon kind={k.id} className="h-3.5 w-3.5" />
                              {k.label}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      value={l.url}
                      onChange={(e) => updateLinkUrl(i, e.target.value)}
                      placeholder="https://…"
                      className="h-10 bg-card"
                      inputMode="url"
                    />
                    <Input
                      value={l.label}
                      onChange={(e) => updateLink(i, { label: e.target.value })}
                      placeholder="Libellé"
                      className="h-10 bg-card"
                    />
                    <button
                      type="button"
                      onClick={() => setLinks((prev) => prev.filter((_, j) => j !== i))}
                      className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground hover:bg-negative hover:text-negative-foreground"
                      aria-label="Retirer le lien"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Stack */}
          <div className="space-y-3">
            <Label htmlFor="project-stack">Outils &amp; techno</Label>
            <div className="flex flex-wrap gap-2">
              {stack.map((s) => (
                <span
                  key={s}
                  className="inline-flex items-center gap-1 rounded-full bg-tint-soft py-1 pl-3 pr-1.5 text-[13px] font-medium"
                >
                  {s}
                  <button
                    type="button"
                    onClick={() => setStack((prev) => prev.filter((x) => x !== s))}
                    className="rounded-full p-0.5 text-muted-foreground hover:bg-card hover:text-foreground"
                    aria-label={`Retirer ${s}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
            <Input
              id="project-stack"
              value={stackDraft}
              onChange={(e) => setStackDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  addStack();
                }
              }}
              onBlur={addStack}
              placeholder="Next.js, Supabase, Coolify… (Entrée pour ajouter)"
            />
          </div>

          {/* Contacts */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Contacts</Label>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setNewContactOpen((v) => !v)}
              >
                <Plus /> Nouveau contact
              </Button>
            </div>
            {newContactOpen && (
              <div className="grid gap-2 rounded-2xl bg-tint-soft p-2 sm:grid-cols-[1fr_1fr_auto]">
                <Input
                  value={newContactName}
                  onChange={(e) => setNewContactName(e.target.value)}
                  placeholder="Nom"
                  className="h-10 bg-card"
                />
                <Input
                  value={newContactEmail}
                  onChange={(e) => setNewContactEmail(e.target.value)}
                  placeholder="Courriel (optionnel)"
                  className="h-10 bg-card"
                  inputMode="email"
                />
                <Button
                  type="button"
                  size="sm"
                  className="h-10"
                  onClick={createContact}
                  disabled={creatingContact || !newContactName.trim()}
                >
                  Créer
                </Button>
              </div>
            )}
            {contacts.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">
                Aucun contact encore. Crée-en un ici ou dans l&apos;onglet Contacts.
              </p>
            ) : (
              <ul className="max-h-48 divide-y divide-border overflow-y-auto rounded-2xl bg-secondary/60 px-3">
                {contacts.map((c) => {
                  const checked = contactIds.includes(c.id);
                  return (
                    <li key={c.id}>
                      <label className="flex cursor-pointer items-center gap-3 py-2.5">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(v) => toggleContact(c.id, v === true)}
                        />
                        <span className="min-w-0 flex-1 truncate text-[14px]">
                          {c.name}
                          {(c.role || c.company) && (
                            <span className="text-muted-foreground">
                              {" "}
                              · {[c.role, c.company].filter(Boolean).join(", ")}
                            </span>
                          )}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Footer */}
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
            <Button type="submit" disabled={submitting || creatingContact}>
              {submitting ? "Enregistrement…" : editing ? "Enregistrer" : "Créer le projet"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
