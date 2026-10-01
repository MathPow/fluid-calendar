"use client";

import { useEffect, useMemo, useState } from "react";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import {
  AtSign,
  Building2,
  Check,
  Pencil,
  Phone,
  Plus,
  Search,
  Star,
  Tag,
  Tags,
  User,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";

import { DEFAULT_PROJECT_COLOR, initials, relationLabel } from "@/lib/projets/meta";
import type { ContactFull } from "@/lib/projets/queries";

import { useStationStore } from "@/store/station";

import { ContactDialog } from "./ContactDialog";
import { type ContactTagRow, ContactTagsManager, TagChip } from "./ContactTags";
import { SocialLinkButtons } from "./social-links";
import { ContactsSwitch } from "./ContactsSwitch";
import { Avatar } from "./ImageField";
import type { ProjectLite } from "./ProjectDialog";

interface ContactsBoardProps {
  contacts: ContactFull[];
  projects: ProjectLite[];
}

const ALL = "__all__";

/**
 * The Contacts tab: people as tiles, searchable (name, company, relation,
 * tags and private keywords, notes…), filterable by favourite, official
 * tags, relation and job. The
 * Perso / Client switch narrows to contacts attached to at least one project
 * of that station (unattached contacts always show).
 */
export function ContactsBoard({ contacts: initial, projects }: ContactsBoardProps) {
  const t = useT();
  const { currentStation } = useStationStore();
  const [contacts, setContacts] = useState<ContactFull[]>(initial);
  const [query, setQuery] = useState("");
  // ?q= from the search palette opens the board already filtered.
  const urlQuery = useSearchParams().get("q");
  useEffect(() => {
    if (urlQuery) setQuery(urlQuery);
  }, [urlQuery]);
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [type, setType] = useState<"all" | "person" | "company">("all");
  const [relation, setRelation] = useState<string>(ALL);
  const [job, setJob] = useState<string>(ALL);
  /** Official tags to filter on: a contact must carry all of them. */
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [manageTags, setManageTags] = useState(false);
  const router = useRouter();
  const toggleTag = (id: string) =>
    setTagFilter((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  const [dialog, setDialog] = useState<{ open: boolean; contact?: ContactFull | null }>({
    open: false,
  });

  // Server refreshes (after a dialog save) replace the local copy.
  useEffect(() => {
    setContacts(initial);
  }, [initial]);

  const stationOf = useMemo(
    () => new Map(projects.map((p) => [p.id, p.station])),
    [projects]
  );

  const { relations, jobs } = useMemo(() => {
    const distinct = (pick: (c: ContactFull) => string | null) =>
      Array.from(new Set(contacts.map(pick).filter((v): v is string => !!v))).sort((a, b) =>
        a.localeCompare(b, "fr")
      );
    return { relations: distinct((c) => c.relation), jobs: distinct((c) => c.role) };
  }, [contacts]);

  // Official tags in use, most used first, with their counts.
  const allTags = useMemo(() => {
    const map = new Map<string, ContactTagRow & { count: number }>();
    for (const c of contacts)
      for (const lbl of c.labels) {
        const row = map.get(lbl.id) ?? { ...lbl, count: 0 };
        row.count++;
        map.set(lbl.id, row);
      }
    return [...map.values()].sort(
      (a, b) => b.count - a.count || a.name.localeCompare(b.name, "fr")
    );
  }, [contacts]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return contacts
      .filter((c) => {
        if (onlyFavorites && !c.favorite) return false;
        if (type !== "all" && c.type !== type) return false;
        if (relation !== ALL && c.relation !== relation) return false;
        if (job !== ALL && c.role !== job) return false;
        if (
          tagFilter.length &&
          !tagFilter.every((id) => c.labels.some((t) => t.id === id))
        )
          return false;
        if (currentStation !== "both" && c.projects.length > 0) {
          const inStation = c.projects.some(
            (p) => stationOf.get(p.projectId) === currentStation
          );
          if (!inStation) return false;
        }
        if (!q) return true;
        return [
          c.name,
          c.company,
          c.role,
          relationLabel(c.relation),
          c.relationDetail,
          c.email,
          c.phone,
          ...c.links.map((l) => l.value),
          c.notes,
          ...c.tags,
          ...c.labels.map((t) => t.name),
        ]
          .filter(Boolean)
          .some((v) => (v as string).toLowerCase().includes(q));
      })
      .sort(
        (a, b) => Number(b.favorite) - Number(a.favorite) || a.name.localeCompare(b.name, "fr")
      );
  }, [contacts, currentStation, query, onlyFavorites, type, relation, job, tagFilter, stationOf]);

  const favoriteCount = contacts.filter((c) => c.favorite).length;
  const companyCount = contacts.filter((c) => c.type === "company").length;
  const companyNames = useMemo(
    () => contacts.filter((c) => c.type === "company").map((c) => c.name).sort(),
    [contacts]
  );
  const filtersActive =
    onlyFavorites ||
    type !== "all" ||
    relation !== ALL ||
    job !== ALL ||
    tagFilter.length > 0 ||
    query.trim() !== "";

  const toggleFavorite = async (c: ContactFull) => {
    const next = !c.favorite;
    setContacts((prev) => prev.map((x) => (x.id === c.id ? { ...x, favorite: next } : x)));
    try {
      const res = await fetch(`/api/contacts/${c.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ favorite: next }),
      });
      if (!res.ok) throw new Error(`Erreur ${res.status}`);
    } catch (e) {
      setContacts((prev) => prev.map((x) => (x.id === c.id ? { ...x, favorite: !next } : x)));
      toast.error(t("toasts.contacts.favoriteFailed"), {
        description: e instanceof Error ? e.message : undefined,
      });
    }
  };

  const resetFilters = () => {
    setQuery("");
    setOnlyFavorites(false);
    setType("all");
    setRelation(ALL);
    setJob(ALL);
    setTagFilter([]);
  };

  return (
    <div className="page pb-16 pt-8 md:pt-12">
      <header className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="display text-[44px] sm:text-[64px] md:text-[80px]">
            {t("contacts.board.title")}
          </h1>
          <div className="mt-6 flex flex-wrap gap-2">
            <Badge className="px-4 py-2 text-[13px]">
              {t(
                contacts.length - companyCount > 1
                  ? "contacts.board.badge.peoplePlural"
                  : "contacts.board.badge.people",
                { count: contacts.length - companyCount }
              )}
              {companyCount > 0 &&
                ` · ${t(
                  companyCount > 1
                    ? "contacts.board.badge.companiesPlural"
                    : "contacts.board.badge.companies",
                  { count: companyCount }
                )}`}
            </Badge>
            {favoriteCount > 0 && (
              <Badge variant="pending" className="px-4 py-2 text-[13px]">
                {t(
                  favoriteCount > 1
                    ? "contacts.board.badge.favoritesPlural"
                    : "contacts.board.badge.favorites",
                  { count: favoriteCount }
                )}
              </Badge>
            )}
            {currentStation !== "both" && (
              <Badge variant="tint" className="px-4 py-2 text-[13px]">
                {t("contacts.board.badge.stationFilter", {
                  station:
                    currentStation === "work"
                      ? t("contacts.board.station.work")
                      : t("contacts.board.station.perso"),
                })}
              </Badge>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <ContactsSwitch />
          <Button size="lg" onClick={() => setDialog({ open: true, contact: null })}>
            <Plus /> {t("contacts.board.newContact")}
          </Button>
        </div>
      </header>
      <div className="filet mt-8" />

      {contacts.length > 0 && (
        <div className="mt-8 flex flex-wrap items-center gap-2">
          <div className="flex h-11 min-w-0 flex-1 basis-64 items-center gap-3 rounded-full bg-secondary px-5">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("contacts.board.searchPlaceholder")}
              className="h-full min-w-0 flex-1 border-0 bg-transparent p-0 text-[15px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-0"
            />
          </div>

          <div className="segmented h-11">
            <button type="button" className="segmented-item" data-active={type === "all"} onClick={() => setType("all")}>
              {t("contacts.board.filter.all")}
            </button>
            <button type="button" className="segmented-item" data-active={type === "person"} onClick={() => setType("person")}>
              <User className="h-3.5 w-3.5" /> {t("contacts.board.filter.people")}
            </button>
            <button type="button" className="segmented-item" data-active={type === "company"} onClick={() => setType("company")}>
              <Building2 className="h-3.5 w-3.5" /> {t("contacts.board.filter.companies")}
            </button>
          </div>

          <button
            type="button"
            onClick={() => setOnlyFavorites((v) => !v)}
            aria-pressed={onlyFavorites}
            className={cn(
              "inline-flex h-11 items-center gap-2 rounded-full px-4 text-[13px] font-medium transition-colors",
              onlyFavorites
                ? "bg-pending text-pending-foreground"
                : "bg-secondary text-foreground hover:bg-border/70"
            )}
          >
            <Star className={cn("h-4 w-4", onlyFavorites && "fill-current")} />
            {t("contacts.board.filter.favorites")}
          </button>

          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={cn(
                  "inline-flex h-11 items-center gap-2 rounded-full px-4 text-[13px] font-medium transition-colors",
                  tagFilter.length
                    ? "bg-foreground text-background"
                    : "bg-secondary text-foreground hover:bg-border/70"
                )}
              >
                <Tags className="h-4 w-4" />
                {t("contacts.board.filter.tags")}
                {tagFilter.length > 0 && (
                  <span className="rounded-full bg-background/20 px-1.5 text-[11px] tabular-nums">
                    {tagFilter.length}
                  </span>
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-72 p-2">
              {allTags.length === 0 ? (
                <p className="px-2 py-3 text-[13px] text-muted-foreground">
                  {t("contacts.board.tagsPopover.empty")}
                </p>
              ) : (
                <ul className="max-h-72 overflow-y-auto">
                  {allTags.map((tag) => {
                    const on = tagFilter.includes(tag.id);
                    return (
                      <li key={tag.id}>
                        <button
                          type="button"
                          onClick={() => toggleTag(tag.id)}
                          aria-pressed={on}
                          className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13px] hover:bg-secondary"
                        >
                          <span
                            className={cn(
                              "flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] border",
                              on
                                ? "border-foreground bg-foreground text-background"
                                : "border-border"
                            )}
                          >
                            {on && <Check className="h-3 w-3" />}
                          </span>
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: tag.color ?? "#d9d6d0" }}
                          />
                          <span className="flex-1 truncate font-medium">{tag.name}</span>
                          <span className="text-[12px] tabular-nums text-muted-foreground">
                            {tag.count}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              {tagFilter.length > 1 && (
                <p className="px-2.5 pt-1 text-[11px] text-muted-foreground">
                  {t("contacts.board.tagsPopover.andHint")}
                </p>
              )}
              <div className="mt-1 border-t border-border pt-1">
                <button
                  type="button"
                  onClick={() => setManageTags(true)}
                  className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-[13px] text-muted-foreground hover:bg-secondary hover:text-foreground"
                >
                  <Pencil className="h-3.5 w-3.5" /> {t("contacts.board.tagsPopover.manage")}
                </button>
              </div>
            </PopoverContent>
          </Popover>

          <Select value={relation} onValueChange={setRelation}>
            <SelectTrigger
              className={cn(
                "h-11 w-auto min-w-[10rem] rounded-full",
                relation !== ALL && "bg-tint-soft"
              )}
            >
              <SelectValue placeholder={t("contacts.board.filter.relationLabel")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("contacts.board.filter.allRelations")}</SelectItem>
              {relations.map((r) => (
                <SelectItem key={r} value={r}>
                  {relationLabel(r)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={job} onValueChange={setJob}>
            <SelectTrigger
              className={cn("h-11 w-auto min-w-[9rem] rounded-full", job !== ALL && "bg-tint-soft")}
            >
              <SelectValue placeholder={t("contacts.board.filter.jobLabel")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("contacts.board.filter.allJobs")}</SelectItem>
              {jobs.map((j) => (
                <SelectItem key={j} value={j}>
                  {j}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {filtersActive && (
            <Button variant="ghost" size="sm" onClick={resetFilters}>
              <X /> {t("contacts.board.filter.reset")}
            </Button>
          )}
        </div>
      )}

      {visible.length === 0 ? (
        <div className="tile mt-8 px-6 py-16 text-center">
          <p className="text-[15px] font-semibold tracking-title">
            {contacts.length === 0
              ? t("contacts.board.empty.title")
              : t("contacts.board.noMatch.title")}
          </p>
          <p className="mx-auto mt-1 max-w-md text-[13px] text-muted-foreground">
            {contacts.length === 0
              ? t("contacts.board.empty.description")
              : t("contacts.board.noMatch.description")}
          </p>
          {contacts.length === 0 ? (
            <Button className="mt-6" onClick={() => setDialog({ open: true, contact: null })}>
              <Plus /> {t("contacts.board.newContact")}
            </Button>
          ) : (
            <Button variant="outline" className="mt-6" onClick={resetFilters}>
              {t("contacts.board.noMatch.resetFilters")}
            </Button>
          )}
        </div>
      ) : (
        <>
          <p className="mt-5 text-[13px] text-muted-foreground">
            {t("contacts.board.countOf", {
              shown: visible.length,
              total: contacts.length,
            })}
          </p>
          <ul className="mt-3 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {visible.map((c) => (
              <li key={c.id} className="tile flex flex-col p-6 md:p-7">
                <div className="flex items-start gap-4">
                  <Avatar
                    image={c.image}
                    fallback={initials(c.name)}
                    color={c.type === "company" ? "#bfd3a8" : c.favorite ? "#ffd166" : "#a8ccff"}
                    shape={c.type === "company" ? "rounded" : "round"}
                    className={cn(
                      "h-12 w-12 text-[14px]",
                      c.favorite && "ring-2 ring-pending ring-offset-2 ring-offset-card"
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[18px] font-bold leading-tight tracking-title">
                      {c.name}
                    </p>
                    <p className="mt-1 flex items-center gap-1 truncate text-[13px] text-muted-foreground">
                      {c.type === "company" && <Building2 className="h-3.5 w-3.5 shrink-0" />}
                      <span className="truncate">
                        {[c.role, c.type === "company" ? null : c.company].filter(Boolean).join(" · ") ||
                          (c.type === "company" ? t("contacts.board.card.companyFallback") : "—")}
                      </span>
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center">
                    <button
                      type="button"
                      onClick={() => toggleFavorite(c)}
                      aria-pressed={c.favorite}
                      aria-label={
                        c.favorite
                          ? t("contacts.board.card.unfavorite", { name: c.name })
                          : t("contacts.board.card.favorite", { name: c.name })
                      }
                      className={cn(
                        "flex h-9 w-9 items-center justify-center rounded-full transition-colors",
                        c.favorite
                          ? "text-pending-foreground hover:bg-pending"
                          : "text-muted-foreground/60 hover:bg-secondary hover:text-foreground"
                      )}
                    >
                      <Star className={cn("h-[18px] w-[18px]", c.favorite && "fill-current")} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDialog({ open: true, contact: c })}
                      className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                      aria-label={t("contacts.board.card.edit", { name: c.name })}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {c.labels.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {c.labels.map((lbl) => (
                      <TagChip
                        key={lbl.id}
                        tag={lbl}
                        active={tagFilter.includes(lbl.id)}
                        onClick={() => toggleTag(lbl.id)}
                      />
                    ))}
                  </div>
                )}

                {(c.relation || c.relationDetail || c.tags.length > 0) && (
                  <div className="mt-4 flex flex-wrap items-center gap-1.5">
                    {!c.relation && c.relationDetail && (
                      <span className="inline-flex items-center rounded-full bg-tint-soft px-3 py-1 text-[12px] font-medium">
                        {c.relationDetail}
                      </span>
                    )}
                    {c.relation && (
                      <button
                        type="button"
                        onClick={() => setRelation(c.relation as string)}
                        className="inline-flex items-center gap-1.5 rounded-full bg-tint-soft px-3 py-1 text-[12px] font-medium transition-colors hover:bg-tint"
                        title={t("contacts.board.card.relationFilter")}
                      >
                        {relationLabel(c.relation)}
                        {c.relationDetail && (
                          <span className="font-normal text-muted-foreground">
                            · {c.relationDetail}
                          </span>
                        )}
                      </button>
                    )}
                    {c.tags.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => setQuery(tag)}
                        className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-border/70 hover:text-foreground"
                        title={t("contacts.board.card.keywordSearch")}
                      >
                        <Tag className="h-3 w-3" />
                        {tag}
                      </button>
                    ))}
                  </div>
                )}

                {(c.email || c.phone) && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {c.email && (
                      <a
                        href={`mailto:${c.email}`}
                        className="inline-flex h-9 max-w-full items-center gap-2 rounded-full bg-secondary px-3.5 text-[13px] font-medium transition-colors hover:bg-foreground hover:text-background"
                      >
                        <AtSign className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{c.email}</span>
                      </a>
                    )}
                    {c.phone && (
                      <a
                        href={`tel:${c.phone}`}
                        className="inline-flex h-9 items-center gap-2 rounded-full bg-secondary px-3.5 text-[13px] font-medium transition-colors hover:bg-foreground hover:text-background"
                      >
                        <Phone className="h-3.5 w-3.5 shrink-0" />
                        {c.phone}
                      </a>
                    )}
                  </div>
                )}

                <SocialLinkButtons links={c.links} className="mt-3" />

                {c.notes && (
                  <p className="mt-4 line-clamp-3 text-[14px] leading-relaxed text-muted-foreground">
                    {c.notes}
                  </p>
                )}

                {c.projects.length > 0 && (
                  <div className="mt-auto pt-5">
                    <p className="etiquette">{t("contacts.board.card.projects")}</p>
                    <ul className="mt-2 flex flex-wrap gap-1.5">
                      {c.projects.map(({ project }) => (
                        <li key={project.id}>
                          <Link
                            href={`/projets/${encodeURIComponent(project.slug)}`}
                            className="inline-flex items-center gap-1.5 rounded-full bg-secondary py-1 pl-2 pr-3 text-[12px] font-medium transition-colors hover:bg-foreground hover:text-background"
                          >
                            <span
                              className="h-2 w-2 rounded-full"
                              style={{ backgroundColor: project.color ?? DEFAULT_PROJECT_COLOR }}
                            />
                            {project.name}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      <ContactTagsManager
        open={manageTags}
        onOpenChange={setManageTags}
        onChanged={() => router.refresh()}
      />
      <ContactDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
        contact={dialog.contact}
        projects={projects}
        companyNames={companyNames}
      />
    </div>
  );
}
