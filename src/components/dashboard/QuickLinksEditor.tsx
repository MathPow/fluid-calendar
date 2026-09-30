"use client";

import { useEffect, useMemo, useState } from "react";

import {
  ArrowDown,
  ArrowUp,
  Building2,
  Check,
  ChevronRight,
  FolderGit2,
  Plus,
  Search,
  X,
} from "lucide-react";

import { LinkKindIcon } from "@/components/projets/link-icons";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

import {
  type CustomLink,
  CustomLinkInput,
  MAX_CUSTOM_LINKS,
} from "@/lib/dashboard/layout";
import {
  DEFAULT_PROJECT_COLOR,
  guessLinkKind,
  initials,
  linkKindLabel,
  normalizeUrl,
} from "@/lib/projets/meta";
import { cn } from "@/lib/utils";

interface SourceLink {
  kind: string;
  label: string | null;
  url: string;
}
interface Source {
  id: string;
  name: string;
  color: string | null;
  kind: "project" | "org";
  /** The DreamDash page of the project / organisation. */
  page: string;
  links: SourceLink[];
  /** Organisation name, for projects. */
  parent?: string;
}

const newId = () => Math.random().toString(36).slice(2, 10);

const hostOf = (url: string) => {
  if (url.startsWith("/")) return "DreamDash";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

/** The mark of a quick link: initials for a project / org, else its kind. */
export function CustomLinkMark({
  link,
  className,
}: {
  link: Pick<CustomLink, "kind" | "label" | "color">;
  className?: string;
}) {
  if (link.kind === "project" || link.kind === "org")
    return (
      <span
        className={cn(
          "flex h-4 w-4 shrink-0 items-center justify-center text-[7px] font-bold leading-none text-white",
          link.kind === "org" ? "rounded-full" : "rounded-[4px]",
          className
        )}
        style={{ backgroundColor: link.color ?? DEFAULT_PROJECT_COLOR }}
        aria-hidden
      >
        {initials(link.label).slice(0, 2)}
      </span>
    );
  return <LinkKindIcon kind={link.kind} className={className} />;
}

/**
 * « Mes liens » of Accès rapide: add any address, or import a project's or an
 * organisation's page and links from Projets; reorder and remove.
 */
export function QuickLinksEditor({
  open,
  onOpenChange,
  links,
  onChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  links: CustomLink[];
  onChange: (links: CustomLink[]) => void;
}) {
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"url" | "import">("url");
  const full = links.length >= MAX_CUSTOM_LINKS;

  useEffect(() => {
    if (!open) {
      setLabel("");
      setUrl("");
      setError(null);
    }
  }, [open]);

  const add = (l: Omit<CustomLink, "id">) => {
    if (full) return;
    onChange([...links, { ...l, id: newId() }]);
  };

  const addTyped = () => {
    const raw = url.trim();
    const address = raw.startsWith("/") ? raw : normalizeUrl(raw);
    const kind = address.startsWith("/")
      ? "other"
      : (guessLinkKind(address) ?? "website");
    const parsed = CustomLinkInput.safeParse({
      id: newId(),
      label: label.trim() || hostOf(address),
      url: address,
      kind,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Lien invalide");
      return;
    }
    add(parsed.data);
    setLabel("");
    setUrl("");
    setError(null);
  };

  const move = (i: number, by: number) => {
    const j = i + by;
    if (j < 0 || j >= links.length) return;
    const next = [...links];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Mes liens</DialogTitle>
          <DialogDescription>
            Des liens à toi dans « Accès rapide », à côté des onglets. Un site
            s&apos;ouvre dans un nouvel onglet.
          </DialogDescription>
        </DialogHeader>

        {links.length === 0 ? (
          <p className="rounded-2xl bg-secondary/60 px-4 py-5 text-center text-[13px] text-muted-foreground">
            Aucun lien pour l&apos;instant.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {links.map((l, i) => (
              <li
                key={l.id}
                className="flex items-center gap-2.5 rounded-2xl bg-secondary/60 py-2 pl-3 pr-1.5"
              >
                <CustomLinkMark link={l} className="h-4 w-4" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold tracking-title">
                    {l.label}
                  </span>
                  <span className="block truncate text-[12px] text-muted-foreground">
                    {hostOf(l.url)}
                  </span>
                </span>
                <IconButton
                  label="Monter"
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </IconButton>
                <IconButton
                  label="Descendre"
                  disabled={i === links.length - 1}
                  onClick={() => move(i, 1)}
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </IconButton>
                <IconButton
                  label={`Retirer ${l.label}`}
                  onClick={() => onChange(links.filter((x) => x.id !== l.id))}
                  danger
                >
                  <X className="h-4 w-4" />
                </IconButton>
              </li>
            ))}
          </ul>
        )}

        <div className="segmented mt-2 flex w-full p-1">
          <button
            type="button"
            className="segmented-item h-8 flex-1"
            aria-pressed={tab === "url"}
            onClick={() => setTab("url")}
          >
            <Plus className="h-3.5 w-3.5" />
            Adresse
          </button>
          <button
            type="button"
            className="segmented-item h-8 flex-1"
            aria-pressed={tab === "import"}
            onClick={() => setTab("import")}
          >
            <FolderGit2 className="h-3.5 w-3.5" />
            Depuis Projets
          </button>
        </div>

        {full ? (
          <p className="text-[13px] text-muted-foreground">
            {MAX_CUSTOM_LINKS} liens au maximum.
          </p>
        ) : tab === "url" ? (
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              addTyped();
            }}
          >
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="coolify.exemple.com, https://… ou /notes"
              aria-label="Adresse"
              autoFocus
            />
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Nom (facultatif)"
              aria-label="Nom"
              maxLength={40}
            />
            {error && (
              <p className="text-[12px] text-negative-foreground">{error}</p>
            )}
            <Button type="submit" size="sm" disabled={!url.trim()}>
              <Plus className="h-4 w-4" />
              Ajouter le lien
            </Button>
          </form>
        ) : (
          <ImportPicker links={links} onAdd={add} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors disabled:opacity-30",
        danger
          ? "hover:bg-negative hover:text-negative-foreground"
          : "hover:bg-card hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

/** Projects and organisations from Projets; each opens onto its page + links. */
function ImportPicker({
  links,
  onAdd,
}: {
  links: CustomLink[];
  onAdd: (l: Omit<CustomLink, "id">) => void;
}) {
  const [sources, setSources] = useState<Source[] | null>(null);
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const json = (r: Response) => (r.ok ? r.json() : []);
    Promise.all([
      fetch("/api/organisations").then(json),
      fetch("/api/projets").then(json),
    ])
      .then(([orgs, projects]) => {
        if (cancelled) return;
        type Row = {
          id: string;
          name: string;
          slug?: string;
          color: string | null;
          isDefault?: boolean;
          organisationId?: string | null;
          links?: SourceLink[];
        };
        const orgName = new Map(
          (orgs as Row[]).map((o) => [o.id, o.name] as const)
        );
        setSources([
          ...(orgs as Row[])
            .filter((o) => !o.isDefault)
            .map((o) => ({
              id: `org:${o.id}`,
              name: o.name,
              color: o.color,
              kind: "org" as const,
              page: `/projets?org=${encodeURIComponent(o.id)}`,
              links: o.links ?? [],
            })),
          ...(projects as Row[]).map((p) => ({
            id: `project:${p.id}`,
            name: p.name,
            color: p.color,
            kind: "project" as const,
            page: `/projets/${encodeURIComponent(p.slug ?? p.id)}`,
            links: p.links ?? [],
            parent: p.organisationId
              ? orgName.get(p.organisationId)
              : undefined,
          })),
        ]);
      })
      .catch(() => !cancelled && setSources([]));
    return () => {
      cancelled = true;
    };
  }, []);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (sources ?? []).filter(
      (s) =>
        !q ||
        s.name.toLowerCase().includes(q) ||
        s.parent?.toLowerCase().includes(q)
    );
  }, [sources, query]);

  const have = new Set(links.map((l) => l.url));

  if (!sources)
    return (
      <p className="py-6 text-center text-[13px] text-muted-foreground">
        Chargement…
      </p>
    );

  return (
    <div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Chercher un projet ou une organisation"
          className="pl-9"
          aria-label="Chercher"
        />
      </div>
      <ul className="mt-2 max-h-[45vh] space-y-1 overflow-y-auto">
        {shown.length === 0 && (
          <li className="py-6 text-center text-[13px] text-muted-foreground">
            Rien ne correspond.
          </li>
        )}
        {shown.map((s) => {
          const expanded = openId === s.id;
          const choices: (Omit<CustomLink, "id"> & { note: string })[] = [
            {
              label: s.name,
              url: s.page,
              kind: s.kind,
              color: s.color ?? undefined,
              note: "Page dans DreamDash",
            },
            ...s.links.map((l) => {
              const kind = l.kind || guessLinkKind(l.url) || "other";
              return {
                label: (l.label || `${s.name} · ${linkKindLabel(kind)}`).slice(
                  0,
                  40
                ),
                url: l.url,
                kind,
                note: `${linkKindLabel(kind)} · ${hostOf(l.url)}`,
              };
            }),
          ];
          return (
            <li key={s.id} className="rounded-2xl bg-secondary/50">
              <button
                type="button"
                onClick={() => setOpenId(expanded ? null : s.id)}
                aria-expanded={expanded}
                className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left"
              >
                <CustomLinkMark
                  link={{
                    kind: s.kind,
                    label: s.name,
                    color: s.color ?? undefined,
                  }}
                  className="h-5 w-5 text-[8px]"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold tracking-title">
                    {s.name}
                  </span>
                  <span className="flex items-center gap-1 text-[12px] text-muted-foreground">
                    {s.kind === "org" ? (
                      <Building2 className="h-3 w-3" />
                    ) : (
                      <FolderGit2 className="h-3 w-3" />
                    )}
                    {s.kind === "org" ? "Organisation" : (s.parent ?? "Projet")}
                    {s.links.length > 0 &&
                      ` · ${s.links.length} lien${s.links.length > 1 ? "s" : ""}`}
                  </span>
                </span>
                <ChevronRight
                  className={cn(
                    "h-4 w-4 text-muted-foreground transition-transform",
                    expanded && "rotate-90"
                  )}
                />
              </button>
              {expanded && (
                <ul className="space-y-0.5 px-1.5 pb-1.5">
                  {choices.map((c) => {
                    const added = have.has(c.url);
                    return (
                      <li key={c.url}>
                        <button
                          type="button"
                          disabled={added}
                          onClick={() => {
                            onAdd({
                              label: c.label,
                              url: c.url,
                              kind: c.kind,
                              color: c.color,
                            });
                          }}
                          className="flex w-full items-center gap-2.5 rounded-xl bg-card px-3 py-2 text-left transition-colors hover:bg-card/60 disabled:opacity-60"
                        >
                          <CustomLinkMark link={c} className="h-4 w-4" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-medium">
                              {c.label}
                            </span>
                            <span className="block truncate text-[11px] text-muted-foreground">
                              {c.note}
                            </span>
                          </span>
                          {added ? (
                            <Check className="h-4 w-4 text-positive-foreground" />
                          ) : (
                            <Plus className="h-4 w-4 text-muted-foreground" />
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
