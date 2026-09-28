"use client";

import { useMemo, useState } from "react";

import Link from "next/link";

import { AtSign, Pencil, Phone, Plus, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { DEFAULT_PROJECT_COLOR, initials } from "@/lib/projets/meta";
import type { ContactFull } from "@/lib/projets/queries";

import { useStationStore } from "@/store/station";

import { ContactDialog } from "./ContactDialog";
import type { ProjectLite } from "./ProjectDialog";
import { SectionSwitch } from "./SectionSwitch";

interface ContactsBoardProps {
  contacts: ContactFull[];
  projects: ProjectLite[];
}

/**
 * The Contacts tab: people as tiles, searchable, each showing the projects
 * they're attached to. The Perso / Client switch narrows to contacts attached
 * to at least one project of that station (unattached contacts always show).
 */
export function ContactsBoard({ contacts, projects }: ContactsBoardProps) {
  const { currentStation } = useStationStore();
  const [query, setQuery] = useState("");
  const [dialog, setDialog] = useState<{ open: boolean; contact?: ContactFull | null }>({
    open: false,
  });

  const stationOf = useMemo(
    () => new Map(projects.map((p) => [p.id, p.station])),
    [projects]
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return contacts.filter((c) => {
      if (currentStation !== "both" && c.projects.length > 0) {
        const inStation = c.projects.some(
          (p) => stationOf.get(p.projectId) === currentStation
        );
        if (!inStation) return false;
      }
      if (!q) return true;
      return [c.name, c.company, c.role, c.email, c.phone]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(q));
    });
  }, [contacts, currentStation, query, stationOf]);

  return (
    <div className="page pb-16 pt-8 md:pt-12">
      <header className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="display text-[44px] sm:text-[64px] md:text-[80px]">Contacts.</h1>
          <div className="mt-6 flex flex-wrap gap-2">
            <Badge className="px-4 py-2 text-[13px]">
              {contacts.length} contact{contacts.length > 1 ? "s" : ""}
            </Badge>
            {currentStation !== "both" && (
              <Badge variant="tint" className="px-4 py-2 text-[13px]">
                Filtre : {currentStation === "work" ? "Client" : "Perso"}
              </Badge>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <SectionSwitch />
          <Button size="lg" onClick={() => setDialog({ open: true, contact: null })}>
            <Plus /> Nouveau contact
          </Button>
        </div>
      </header>
      <div className="filet mt-8" />

      {contacts.length > 0 && (
        <div className="mt-8 flex h-12 max-w-md items-center gap-3 rounded-full bg-secondary px-5">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Chercher un nom, une entreprise, un courriel…"
            className="h-full min-w-0 flex-1 border-0 bg-transparent p-0 text-[15px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-0"
          />
        </div>
      )}

      {visible.length === 0 ? (
        <div className="tile mt-8 px-6 py-16 text-center">
          <p className="text-[15px] font-semibold tracking-title">
            {contacts.length === 0 ? "Aucun contact pour l'instant." : "Aucun contact ne correspond."}
          </p>
          <p className="mx-auto mt-1 max-w-md text-[13px] text-muted-foreground">
            {contacts.length === 0
              ? "Ajoute les gens avec qui tu travailles; tu pourras les rattacher à tes projets."
              : "Essaie un autre mot, ou change la station dans l'en-tête."}
          </p>
          {contacts.length === 0 && (
            <Button className="mt-6" onClick={() => setDialog({ open: true, contact: null })}>
              <Plus /> Nouveau contact
            </Button>
          )}
        </div>
      ) : (
        <ul className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((c) => (
            <li key={c.id} className="tile flex flex-col p-6 md:p-7">
              <div className="flex items-start gap-4">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-tint text-[14px] font-bold text-[#19181c]">
                  {initials(c.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[18px] font-bold leading-tight tracking-title">
                    {c.name}
                  </p>
                  <p className="mt-1 truncate text-[13px] text-muted-foreground">
                    {[c.role, c.company].filter(Boolean).join(" · ") || "—"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setDialog({ open: true, contact: c })}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                  aria-label={`Modifier ${c.name}`}
                >
                  <Pencil className="h-4 w-4" />
                </button>
              </div>

              {(c.email || c.phone) && (
                <div className="mt-5 flex flex-wrap gap-2">
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

              {c.notes && (
                <p className="mt-4 line-clamp-3 text-[14px] leading-relaxed text-muted-foreground">
                  {c.notes}
                </p>
              )}

              <div className="mt-auto pt-5">
                <p className="etiquette">Projets</p>
                {c.projects.length === 0 ? (
                  <p className="mt-2 text-[13px] text-muted-foreground">Aucun</p>
                ) : (
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
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <ContactDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
        contact={dialog.contact}
        projects={projects}
      />
    </div>
  );
}
