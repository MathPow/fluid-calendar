"use client";

import { useEffect, useMemo, useState } from "react";

import { useSearchParams } from "next/navigation";

import {
  ArrowUpDown,
  Building2,
  ChevronDown,
  ChevronUp,
  Pencil,
  Plus,
  Search,
  X,
} from "lucide-react";

import { AskBox } from "@/components/projets/AskBox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import {
  DEFAULT_PROJECT_COLOR,
  initials,
  orgKindLabel,
} from "@/lib/projets/meta";
import type { OrganisationLite, ProjectFull } from "@/lib/projets/queries";
import { cn } from "@/lib/utils";

import { useStationStore } from "@/store/station";

import { Avatar } from "./ImageField";
import { OrganisationDialog } from "./OrganisationDialog";
import { OrganisationOrderDialog } from "./OrganisationOrderDialog";
import {
  type ContactLite,
  ProjectDialog,
  type ProjectLite,
} from "./ProjectDialog";
import {
  EMPTY_FILTERS,
  type FilterOption,
  type ProjectFilterState,
  ProjectFilters,
  filtersActive,
  fold,
} from "./ProjectFilters";
import { ProjectTile } from "./ProjectTile";
import { ReorderDialog } from "./ReorderDialog";
import { LinkPill } from "./link-icons";

interface ProjetsBoardProps {
  projects: ProjectFull[];
  organisations: OrganisationLite[];
  contacts: ContactLite[];
}

/**
 * The Projets tab: one section per organisation (DehorsQC, StayChum…) with
 * its top-level projects as tiles, and the default organisation collecting
 * everything unassigned. Sub-projects are listed inside their parent's tile.
 * The Perso / Client switch in the header filters the projects.
 */
export function ProjetsBoard({
  projects,
  organisations,
  contacts,
}: ProjetsBoardProps) {
  const { currentStation } = useStationStore();
  const [dialog, setDialog] = useState<{
    open: boolean;
    project?: ProjectFull | null;
    organisationId?: string | null;
  }>({ open: false });
  const [orderOpen, setOrderOpen] = useState(false);
  const [projectOrder, setProjectOrder] = useState<{
    org: OrganisationLite;
    projects: ProjectFull[];
  } | null>(null);
  const [orgDialog, setOrgDialog] = useState<{
    open: boolean;
    organisation?: OrganisationLite | null;
  }>({ open: false });
  // Sections show their first few projects; the rest unfold on demand.
  const PREVIEW = 4;
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleExpanded = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const lite: ProjectLite[] = useMemo(
    () =>
      projects.map((p) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        color: p.color,
        parentId: p.parentId,
        station: p.station,
        organisationId: p.organisationId,
      })),
    [projects]
  );

  // Sections in display order: named organisations first, the default last.
  const sections = useMemo(() => {
    const top = projects.filter(
      (p) =>
        !p.parentId &&
        (currentStation === "both" || p.station === currentStation)
    );
    const kindRank = (k: string) =>
      k === "owned" ? 0 : k === "client" ? 1 : 2;
    // The user's order (« Réorganiser »); type then name only break ties.
    const ordered = [...organisations].sort(
      (a, b) =>
        a.sortOrder - b.sortOrder ||
        kindRank(a.kind) - kindRank(b.kind) ||
        a.name.localeCompare(b.name, "fr")
    );
    const known = new Set(organisations.map((o) => o.id));
    return ordered.map((org) => ({
      org,
      projects: top.filter((p) =>
        org.isDefault
          ? !p.organisationId ||
            !known.has(p.organisationId) ||
            p.organisationId === org.id
          : p.organisationId === org.id
      ),
    }));
  }, [projects, organisations, currentStation]);

  const counts = useMemo(
    () => ({ sub: projects.filter((p) => p.parentId).length }),
    [projects]
  );

  // ---------------------------------------------------- Search & filters
  const [filters, setFilters] = useState<ProjectFilterState>(EMPTY_FILTERS);
  // ?org= from the search palette narrows the board to that organisation.
  const urlOrg = useSearchParams().get("org");
  useEffect(() => {
    if (urlOrg) setFilters({ ...EMPTY_FILTERS, organisations: [urlOrg] });
  }, [urlOrg]);
  const filtering = filtersActive(filters);

  // Everything a search can hit, folded once per project: its own fields plus
  // its sub-projects', so a match on a sub-project surfaces the parent.
  const haystacks = useMemo(() => {
    const own = (p: ProjectFull) =>
      [
        p.name,
        p.slug,
        p.description,
        p.path,
        p.organisation?.name,
        ...p.stack,
        ...p.links.flatMap((l) => [l.label, l.url]),
        ...p.contacts.map((c) => c.contact.name),
        ...p.locations.flatMap((l) => [
          l.path,
          l.machine.name,
          l.machine.label,
        ]),
      ]
        .filter(Boolean)
        .join(" ");
    const byId = new Map(projects.map((p) => [p.id, p]));
    return new Map(
      projects.map((p) => [
        p.id,
        fold(
          [
            own(p),
            ...p.children.map((c) =>
              byId.get(c.id) ? own(byId.get(c.id)!) : c.name
            ),
          ].join(" ")
        ),
      ])
    );
  }, [projects]);

  const matches = (p: ProjectFull, orgId: string) => {
    const words = fold(filters.query).split(/\s+/).filter(Boolean);
    const hay = haystacks.get(p.id) ?? "";
    return (
      words.every((w) => hay.includes(w)) &&
      (filters.organisations.length === 0 ||
        filters.organisations.includes(orgId)) &&
      (filters.machines.length === 0 ||
        p.locations.some((l) => filters.machines.includes(l.machine.id))) &&
      (filters.stack.length === 0 ||
        filters.stack.some((t) => p.stack.includes(t))) &&
      (!filters.withShowcase || p.media.length > 0)
    );
  };

  const visibleSections = sections.map((s) => ({
    ...s,
    projects: filtering
      ? s.projects.filter((p) => matches(p, s.org.id))
      : s.projects,
  }));
  const resultCount = visibleSections.reduce(
    (n, s) => n + s.projects.length,
    0
  );

  const filterOptions = useMemo(() => {
    const top = sections.flatMap((s) => s.projects);
    const machineCounts = new Map<string, { label: string; count: number }>();
    for (const p of top)
      for (const l of p.locations) {
        const m = machineCounts.get(l.machine.id);
        if (m) m.count++;
        else
          machineCounts.set(l.machine.id, {
            label: l.machine.label || l.machine.name,
            count: 1,
          });
      }
    const stackCounts = new Map<string, number>();
    for (const p of top)
      for (const t of p.stack)
        stackCounts.set(t, (stackCounts.get(t) ?? 0) + 1);
    return {
      organisations: sections.map(
        (s): FilterOption => ({
          id: s.org.id,
          label: s.org.name,
          count: s.projects.length,
        })
      ),
      machines: [...machineCounts]
        .sort((a, b) => b[1].count - a[1].count)
        .map(
          ([id, m]): FilterOption => ({ id, label: m.label, count: m.count })
        ),
      stack: [...stackCounts]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "fr"))
        .map(([t, count]): FilterOption => ({ id: t, label: t, count })),
    };
  }, [sections]);

  const anyVisible = sections.some((s) => s.projects.length > 0);
  // « Pose une question » stays folded behind the search button.
  const [askOpen, setAskOpen] = useState(false);

  return (
    <div className="page pb-16 pt-8 md:pt-12">
      <header className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="display text-[44px] sm:text-[64px] md:text-[80px]">
            Projets.
          </h1>
          <div className="mt-6 flex flex-wrap gap-2">
            <Badge className="px-4 py-2 text-[13px]">
              {organisations.length} organisation
              {organisations.length > 1 ? "s" : ""}
            </Badge>
            {counts.sub > 0 && (
              <Badge className="px-4 py-2 text-[13px]">
                {counts.sub} sous-projet{counts.sub > 1 ? "s" : ""}
              </Badge>
            )}
            {currentStation !== "both" && (
              <Badge variant="tint" className="px-4 py-2 text-[13px]">
                Filtre : {currentStation === "work" ? "Client" : "Perso"}
              </Badge>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {projects.length > 0 && (
            <Button
              variant={askOpen ? "default" : "outline"}
              size="icon"
              className="h-12 w-12 rounded-full"
              onClick={() => setAskOpen((o) => !o)}
              aria-expanded={askOpen}
              aria-label={
                askOpen
                  ? "Fermer la question"
                  : "Poser une question sur tous les projets"
              }
              title="Poser une question sur tous les projets"
            >
              <span className="relative h-5 w-5">
                <Search
                  className={cn(
                    "absolute inset-0 h-5 w-5 transition-all duration-300",
                    askOpen
                      ? "rotate-90 scale-50 opacity-0"
                      : "rotate-0 scale-100 opacity-100"
                  )}
                />
                <X
                  className={cn(
                    "absolute inset-0 h-5 w-5 transition-all duration-300",
                    askOpen
                      ? "rotate-0 scale-100 opacity-100"
                      : "-rotate-90 scale-50 opacity-0"
                  )}
                />
              </span>
            </Button>
          )}
          <Button
            variant="outline"
            size="lg"
            onClick={() => setOrgDialog({ open: true, organisation: null })}
          >
            <Building2 /> Organisation
          </Button>
          {organisations.length > 1 && (
            <Button
              variant="outline"
              size="lg"
              onClick={() => setOrderOpen(true)}
            >
              <ArrowUpDown /> Réorganiser
            </Button>
          )}
          <Button
            size="lg"
            onClick={() => setDialog({ open: true, project: null })}
          >
            <Plus /> Nouveau projet
          </Button>
        </div>
      </header>
      <div className="filet mt-8" />

      {projects.length > 0 && (
        <div className="mt-8">
          <div
            className={cn(
              "grid transition-[grid-template-rows,opacity,margin] duration-300 ease-out",
              askOpen
                ? "mb-4 grid-rows-[1fr] opacity-100"
                : "grid-rows-[0fr] opacity-0"
            )}
            inert={!askOpen}
          >
            <div className="overflow-hidden">
              <div
                className={cn(
                  "transition-transform duration-300 ease-out",
                  askOpen ? "translate-y-0" : "-translate-y-3"
                )}
              >
                <AskBox
                  placeholder="Pose une question sur tous les projets…"
                  focus={askOpen}
                  onEscape={() => setAskOpen(false)}
                />
              </div>
            </div>
          </div>
          <ProjectFilters
            value={filters}
            onChange={setFilters}
            organisations={filterOptions.organisations}
            machines={filterOptions.machines}
            stack={filterOptions.stack}
            resultCount={resultCount}
          />
        </div>
      )}

      {projects.length > 0 && !anyVisible ? (
        <div className="tile mt-8 px-6 py-16 text-center">
          <p className="text-[15px] font-semibold tracking-title">
            Aucun projet dans cette station.
          </p>
          <p className="mx-auto mt-1 max-w-md text-[13px] text-muted-foreground">
            Passe le sélecteur Perso / Client / Both dans l&apos;en-tête pour en
            voir d&apos;autres.
          </p>
        </div>
      ) : filtering && resultCount === 0 ? (
        <div className="tile mt-8 px-6 py-16 text-center">
          <p className="text-[15px] font-semibold tracking-title">
            Aucun projet trouvé.
          </p>
          <p className="mx-auto mt-1 max-w-md text-[13px] text-muted-foreground">
            Essaie un autre mot ou retire un filtre.
          </p>
        </div>
      ) : (
        visibleSections.map(({ org, projects: list }) => {
          // Hide an empty organisation while a station filter or a search is on.
          if (list.length === 0 && (currentStation !== "both" || filtering))
            return null;
          // Search results show in full, without the « Voir les N autres » fold.
          const open = filtering || expanded.has(org.id);
          return (
            <section key={org.id} className="mt-10">
              <div className="flex flex-wrap items-center gap-3">
                <Avatar
                  image={org.image}
                  fallback={initials(org.name)}
                  color={org.color ?? DEFAULT_PROJECT_COLOR}
                  shape="rounded"
                  className="h-11 w-11 text-[13px]"
                />
                <div className="min-w-0">
                  <h2 className="text-[24px] font-bold leading-none tracking-title">
                    {org.name}
                  </h2>
                  <p className="mt-1 text-[12px] text-muted-foreground">
                    {orgKindLabel(org.kind)} · {list.length} projet
                    {list.length > 1 ? "s" : ""}
                    {org.isDefault && " · par défaut"}
                  </p>
                </div>
                <div className="ml-auto flex items-center gap-1">
                  {list.length > 1 && !filtering && (
                    <button
                      type="button"
                      onClick={() => setProjectOrder({ org, projects: list })}
                      className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                      aria-label={`Réorganiser les projets de ${org.name}`}
                      title="Réorganiser les projets"
                    >
                      <ArrowUpDown className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      setOrgDialog({ open: true, organisation: org })
                    }
                    className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                    aria-label={`Modifier ${org.name}`}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      setDialog({
                        open: true,
                        project: null,
                        organisationId: org.isDefault ? null : org.id,
                      })
                    }
                  >
                    <Plus /> Projet
                  </Button>
                </div>
              </div>
              {org.description && (
                <p className="mt-2 max-w-2xl text-[14px] text-muted-foreground">
                  {org.description}
                </p>
              )}
              {org.links.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {org.links.map((l) => (
                    <LinkPill
                      key={l.id}
                      kind={l.kind}
                      label={l.label}
                      url={l.url}
                    />
                  ))}
                </div>
              )}
              {list.length === 0 ? (
                <p className="mt-4 rounded-[20px] bg-secondary/60 px-5 py-6 text-center text-[13px] text-muted-foreground">
                  Aucun projet ici pour l&apos;instant.
                </p>
              ) : (
                <>
                  <ul className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-5 lg:grid-cols-4">
                    {(open ? list : list.slice(0, PREVIEW)).map((p) => (
                      <ProjectTile
                        key={p.id}
                        project={p}
                        onEdit={(project) => setDialog({ open: true, project })}
                      />
                    ))}
                  </ul>
                  {!filtering && list.length > PREVIEW && (
                    <div className="mt-4 flex justify-center">
                      <Button
                        variant="outline"
                        onClick={() => toggleExpanded(org.id)}
                        aria-expanded={expanded.has(org.id)}
                      >
                        {expanded.has(org.id) ? (
                          <>
                            <ChevronUp /> Réduire
                          </>
                        ) : (
                          <>
                            <ChevronDown /> Voir les {list.length - PREVIEW}{" "}
                            autres
                          </>
                        )}
                      </Button>
                    </div>
                  )}
                </>
              )}
            </section>
          );
        })
      )}

      <ProjectDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
        project={dialog.project}
        organisationId={dialog.organisationId}
        projects={lite}
        organisations={organisations}
        contacts={contacts}
      />
      <ReorderDialog
        open={!!projectOrder}
        onOpenChange={(open) => !open && setProjectOrder(null)}
        title={`Projets de ${projectOrder?.org.name ?? ""}`}
        description="Cet ordre s'applique ici et dans la liste de l'accueil (les 4 premiers)."
        items={projectOrder?.projects ?? []}
        endpoint="/api/projets/order"
      />
      <OrganisationOrderDialog
        open={orderOpen}
        onOpenChange={setOrderOpen}
        organisations={sections.map((s) => s.org)}
      />
      <OrganisationDialog
        open={orgDialog.open}
        onOpenChange={(open) => setOrgDialog((d) => ({ ...d, open }))}
        organisation={orgDialog.organisation}
      />
    </div>
  );
}
