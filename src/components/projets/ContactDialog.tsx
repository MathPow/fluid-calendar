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
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Textarea } from "@/components/ui/textarea";

import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";

import {
  CONTACT_TYPES,
  type ContactType,
  DEFAULT_PROJECT_COLOR,
  RELATION_KINDS,
  initials,
  roleOptions,
} from "@/lib/projets/meta";
import type { ContactFull } from "@/lib/projets/queries";

import { ImageField } from "./ImageField";
import { type SocialLinkDraft, SocialLinksField } from "./social-links";
import type { ProjectLite } from "./ProjectDialog";
import { type ContactTagRow, ContactTagPicker } from "./ContactTags";

interface ContactDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact?: ContactFull | null;
  projects: ProjectLite[];
  /** Names of company contacts, suggested in a person's Entreprise field. */
  companyNames?: string[];
}

export function ContactDialog({
  open,
  onOpenChange,
  contact,
  projects,
  companyNames = [],
}: ContactDialogProps) {
  const router = useRouter();
  const t = useT();
  const editing = !!contact;

  const [type, setType] = useState<ContactType>("person");
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const NO_RELATION = "__none__";
  const [relation, setRelation] = useState<string>(NO_RELATION);
  const [relationDetail, setRelationDetail] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [favorite, setFavorite] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [labels, setLabels] = useState<ContactTagRow[]>([]);
  const [tagDraft, setTagDraft] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [links, setLinks] = useState<SocialLinkDraft[]>([]);
  const [notes, setNotes] = useState("");
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const [projectQuery, setProjectQuery] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setType(contact?.type === "company" ? "company" : "person");
    setName(contact?.name ?? "");
    setCompany(contact?.company ?? "");
    setRole(contact?.role ?? "");
    setRelation(contact?.relation ?? NO_RELATION);
    setRelationDetail(contact?.relationDetail ?? "");
    setImage(contact?.image ?? null);
    setFavorite(contact?.favorite ?? false);
    setTags(contact?.tags ?? []);
    setLabels(contact?.labels ?? []);
    setTagDraft("");
    setEmail(contact?.email ?? "");
    setPhone(contact?.phone ?? "");
    setLinks(
      contact?.links.map((l) => ({ platform: l.platform as SocialLinkDraft["platform"], value: l.value })) ?? []
    );
    setNotes(contact?.notes ?? "");
    setProjectIds(contact?.projects.map((p) => p.projectId) ?? []);
    setProjectQuery("");
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
      toast.error(t("toasts.contacts.needName"));
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
          type,
          name: name.trim(),
          company: type === "company" ? null : company.trim() || null,
          role: role.trim() || null,
          relation: relation === NO_RELATION ? null : relation,
          relationDetail: relationDetail.trim() || null,
          image,
          favorite,
          tags: finalTags,
          tagIds: labels.map((l) => l.id),
          email: email.trim() || null,
          phone: phone.trim() || null,
          links: links
            .map((l) => ({ platform: l.platform, value: l.value.trim() }))
            .filter((l) => l.value),
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
      toast.success(
        editing ? t("toasts.contacts.updated") : t("toasts.contacts.created")
      );
      onOpenChange(false);
      router.refresh();
    } catch (e) {
      toast.error(t("toasts.contacts.saveFailed"), {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async () => {
    if (!contact) return;
    if (!window.confirm(t("contacts.dialog.confirmDelete", { name: contact.name })))
      return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/contacts/${contact.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`Erreur ${res.status}`);
      toast.success(t("toasts.contacts.deleted"));
      onOpenChange(false);
      router.refresh();
    } catch (e) {
      toast.error(t("toasts.contacts.deleteFailed"), {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex flex-col gap-0 overflow-y-hidden p-0 md:p-0 max-w-xl">
        <DialogHeader className="space-y-1.5 px-6 pb-4 pt-6 md:px-8 md:pt-8">
          <DialogTitle>
            {editing
              ? t("contacts.dialog.title.edit")
              : t("contacts.dialog.title.new")}
          </DialogTitle>
          <DialogDescription>
            {t("contacts.dialog.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 pb-6 md:px-8 md:pb-8">
        <div className="segmented w-fit">
          {CONTACT_TYPES.map((ct) => (
            <button
              key={ct.id}
              type="button"
              className="segmented-item"
              data-active={type === ct.id}
              onClick={() => setType(ct.id)}
            >
              {t(ct.labelKey)}
            </button>
          ))}
        </div>

        <form
          id="contact-form"
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
            color={type === "company" ? "#bfd3a8" : "#a8ccff"}
            shape={type === "company" ? "rounded" : "round"}
            label={
              type === "company"
                ? t("contacts.dialog.image.logo")
                : t("contacts.dialog.image.photo")
            }
          />

          <div className="space-y-2">
            <Label htmlFor="contact-name">{t("contacts.dialog.name")}</Label>
            <div className="flex items-center gap-2">
              <Input
                id="contact-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={
                  type === "company"
                    ? t("contacts.dialog.namePlaceholder.company")
                    : t("contacts.dialog.namePlaceholder.person")
                }
                autoFocus
                className="text-[17px] font-semibold tracking-title"
              />
              <button
                type="button"
                onClick={() => setFavorite((v) => !v)}
                aria-pressed={favorite}
                title={
                  favorite
                    ? t("contacts.dialog.favorite.remove")
                    : t("contacts.dialog.favorite.set")
                }
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
            {type === "person" && (
              <div className="space-y-2">
                <Label htmlFor="contact-company">
                  {t("contacts.dialog.company")}
                </Label>
                <Input
                  id="contact-company"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder={t("contacts.dialog.companyPlaceholder")}
                  list="contact-company-suggestions"
                />
                {companyNames.length > 0 && (
                  <datalist id="contact-company-suggestions">
                    {companyNames.map((n) => (
                      <option key={n} value={n} />
                    ))}
                  </datalist>
                )}
              </div>
            )}
            <div className={cn("space-y-2", type === "company" && "sm:col-span-2")}>
              <Label htmlFor="contact-role">
                {type === "company"
                  ? t("contacts.dialog.role.company")
                  : t("contacts.dialog.role.person")}
              </Label>
              <SearchableSelect
                id="contact-role"
                value={role}
                onChange={setRole}
                options={roleOptions(type)}
                placeholder={
                  type === "company"
                    ? t("contacts.dialog.rolePlaceholder.company")
                    : t("contacts.dialog.rolePlaceholder.person")
                }
                allowCustom
              />
            </div>
            <div className="space-y-2">
              <Label>{t("contacts.dialog.relation")}</Label>
              <SearchableSelect
                value={relation === NO_RELATION ? "" : relation}
                onChange={(v) => setRelation(v || NO_RELATION)}
                options={[
                  { value: "", label: t("contacts.dialog.relation.unspecified") },
                  ...RELATION_KINDS.map((k) => ({ value: k.id, label: t(k.labelKey) })),
                ]}
                placeholder={t("contacts.dialog.relationPlaceholder")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact-relation-detail">
                {t("contacts.dialog.relationDetail")}
              </Label>
              <Input
                id="contact-relation-detail"
                value={relationDetail}
                onChange={(e) => setRelationDetail(e.target.value)}
                placeholder={t("contacts.dialog.relationDetailPlaceholder")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact-email">{t("contacts.dialog.email")}</Label>
              <Input
                id="contact-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("contacts.dialog.emailPlaceholder")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact-phone">{t("contacts.dialog.phone")}</Label>
              <Input
                id="contact-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder={t("contacts.dialog.phonePlaceholder")}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t("contacts.dialog.networks")}</Label>
            <SocialLinksField links={links} onChange={setLinks} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="contact-labels">{t("contacts.dialog.tags")}</Label>
            <ContactTagPicker value={labels} onChange={setLabels} />
            <p className="text-[12px] text-muted-foreground">
              {t("contacts.dialog.tagsHint")}
            </p>
          </div>

          <div className="space-y-3">
            <Label htmlFor="contact-tags">{t("contacts.dialog.keywords")}</Label>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 rounded-full bg-secondary py-1 pl-3 pr-1.5 text-[13px] font-medium"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => setTags((prev) => prev.filter((x) => x !== tag))}
                      className="rounded-full p-0.5 text-muted-foreground hover:bg-card hover:text-foreground"
                      aria-label={t("contacts.dialog.keyword.remove", { name: tag })}
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
              placeholder={t("contacts.dialog.keywordsPlaceholder")}
            />
            <p className="text-[12px] text-muted-foreground">
              {t("contacts.dialog.keywordsHint")}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="contact-notes">{t("contacts.dialog.notes")}</Label>
            <Textarea
              id="contact-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t("contacts.dialog.notesPlaceholder")}
              rows={3}
            />
          </div>

          <div className="space-y-3">
            <Label>{t("contacts.dialog.projects")}</Label>
            {projects.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">
                {t("contacts.dialog.projects.empty")}
              </p>
            ) : (
              <>
                {projects.length > 6 && (
                  <Input
                    value={projectQuery}
                    onChange={(e) => setProjectQuery(e.target.value)}
                    placeholder={t("contacts.dialog.projects.searchPlaceholder", {
                      count: projects.length,
                    })}
                    className="h-10"
                  />
                )}
              <ul className="max-h-52 divide-y divide-border overflow-y-auto rounded-2xl bg-secondary/60 px-3">
                {projects
                  .filter((p) => {
                    const q = projectQuery.trim().toLowerCase();
                    if (!q) return true;
                    if (projectIds.includes(p.id)) return true;
                    const parent = p.parentId ? projects.find((x) => x.id === p.parentId)?.name : "";
                    return `${p.name} ${parent ?? ""}`.toLowerCase().includes(q);
                  })
                  .map((p) => (
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
              </>
            )}
          </div>

        </form>
        </div>

        <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-border bg-card px-6 py-4 md:px-8 sm:flex-row sm:items-center">
          {editing && (
            <Button
              type="button"
              variant="ghost"
              className="text-negative-foreground hover:bg-negative hover:text-negative-foreground sm:mr-auto"
              onClick={remove}
              disabled={submitting}
            >
              <Trash2 /> {t("common.delete")}
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
            className="sm:ml-auto"
          >
            {t("common.cancel")}
          </Button>
          <Button type="submit" form="contact-form" disabled={submitting}>
            {submitting
              ? t("common.saving")
              : editing
                ? t("contacts.dialog.submit.save")
                : t("contacts.dialog.submit.create")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
