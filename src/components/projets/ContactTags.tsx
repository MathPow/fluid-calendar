"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Check, Pencil, Plus, Tags, Trash2, X } from "lucide-react";
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

import { PROJECT_COLORS } from "@/lib/projets/meta";
import { cn } from "@/lib/utils";

export interface ContactTagRow {
  id: string;
  name: string;
  color: string | null;
  /** Contacts using it (from GET /api/contact-tags). */
  count?: number;
}

const FALLBACK = "#d9d6d0";

/** An official tag: a coloured pill, stronger than a private keyword. */
export function TagChip({
  tag,
  onClick,
  onRemove,
  active,
  className,
}: {
  tag: Pick<ContactTagRow, "name" | "color">;
  onClick?: () => void;
  onRemove?: () => void;
  active?: boolean;
  className?: string;
}) {
  const color = tag.color ?? FALLBACK;
  const body = (
    <>
      <span
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: color }}
      />
      <span className="truncate">{tag.name}</span>
    </>
  );
  const cls = cn(
    "inline-flex max-w-full items-center gap-1.5 rounded-full border py-1 text-[12px] font-semibold tracking-title transition-colors",
    onRemove ? "pl-2.5 pr-1" : "px-2.5",
    active
      ? "border-foreground bg-foreground text-background"
      : "border-transparent text-foreground",
    className
  );
  const style = active
    ? undefined
    : { backgroundColor: `${color}40`, borderColor: `${color}90` };
  return (
    <span className={cls} style={style}>
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          className="inline-flex min-w-0 items-center gap-1.5"
          title={`Filtrer sur « ${tag.name} »`}
        >
          {body}
        </button>
      ) : (
        body
      )}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="rounded-full p-0.5 opacity-60 transition-opacity hover:bg-card/60 hover:opacity-100"
          aria-label={`Retirer ${tag.name}`}
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}

let cache: ContactTagRow[] | null = null;

export async function fetchContactTags(fresh = false) {
  if (cache && !fresh) return cache;
  const r = await fetch("/api/contact-tags", { cache: "no-store" });
  cache = r.ok ? await r.json() : [];
  return cache!;
}

const nextColor = (taken: number) =>
  PROJECT_COLORS[taken % PROJECT_COLORS.length].hex;

/**
 * Tag field of the contact form: the chosen tags, and a search box that
 * suggests existing tags (most used first) or creates a new one.
 */
export function ContactTagPicker({
  value,
  onChange,
}: {
  value: ContactTagRow[];
  onChange: (tags: ContactTagRow[]) => void;
}) {
  const [all, setAll] = useState<ContactTagRow[] | null>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [creating, setCreating] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchContactTags(true).then(setAll);
  }, []);

  useEffect(() => {
    const close = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);

  const chosen = new Set(value.map((t) => t.id));
  const q = query.trim().toLowerCase();
  const suggestions = useMemo(
    () =>
      (all ?? [])
        .filter((t) => !chosen.has(t.id))
        .filter((t) => !q || t.name.toLowerCase().includes(q))
        .sort(
          (a, b) =>
            Number(b.name.toLowerCase().startsWith(q)) -
              Number(a.name.toLowerCase().startsWith(q)) ||
            (b.count ?? 0) - (a.count ?? 0) ||
            a.name.localeCompare(b.name, "fr")
        )
        .slice(0, 8),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [all, q, value]
  );
  const exact = (all ?? []).some((t) => t.name.toLowerCase() === q);
  const canCreate = q.length > 0 && !exact;
  const options = [
    ...suggestions.map((t) => ({ kind: "tag" as const, tag: t })),
    ...(canCreate ? [{ kind: "create" as const }] : []),
  ];

  const pick = (t: ContactTagRow) => {
    onChange([...value, t]);
    setQuery("");
    setCursor(0);
  };

  const create = async () => {
    const name = query.trim();
    if (!name || creating) return;
    setCreating(true);
    try {
      const r = await fetch("/api/contact-tags", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, color: nextColor((all ?? []).length) }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || `Erreur ${r.status}`);
      setAll((prev) =>
        prev?.some((t) => t.id === body.id) ? prev : [...(prev ?? []), body]
      );
      cache = null;
      if (!chosen.has(body.id)) pick(body);
      else setQuery("");
    } catch (e) {
      toast.error("Tag non créé", {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setCreating(false);
    }
  };

  const choose = (i: number) => {
    const o = options[i];
    if (!o) return;
    if (o.kind === "tag") pick(o.tag);
    else create();
  };

  return (
    <div ref={wrap} className="relative space-y-2">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((t) => (
            <TagChip
              key={t.id}
              tag={t}
              onRemove={() => onChange(value.filter((x) => x.id !== t.id))}
            />
          ))}
        </div>
      )}
      <Input
        id="contact-labels"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setCursor(0);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setCursor((c) => Math.min(c + 1, options.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setCursor((c) => Math.max(c - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (open) choose(cursor);
          } else if (e.key === "Escape" && open) {
            e.stopPropagation();
            setOpen(false);
          } else if (e.key === "Backspace" && !query && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
        placeholder="Chercher ou créer un tag…"
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls="contact-labels-list"
      />
      {open && options.length > 0 && (
        <ul
          id="contact-labels-list"
          role="listbox"
          className="absolute inset-x-0 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-2xl bg-popover p-1.5 shadow-float"
        >
          {options.map((o, i) => (
            <li
              key={o.kind === "tag" ? o.tag.id : "__create"}
              role="option"
              aria-selected={i === cursor}
            >
              <button
                type="button"
                onMouseEnter={() => setCursor(i)}
                onClick={() => choose(i)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[13px]",
                  i === cursor && "bg-secondary"
                )}
              >
                {o.kind === "tag" ? (
                  <>
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: o.tag.color ?? FALLBACK }}
                    />
                    <span className="flex-1 truncate font-medium">
                      {o.tag.name}
                    </span>
                    <span className="text-[12px] tabular-nums text-muted-foreground">
                      {o.tag.count ?? 0}
                    </span>
                  </>
                ) : (
                  <>
                    <Plus className="h-3.5 w-3.5 shrink-0" />
                    <span className="flex-1 truncate">
                      Créer le tag <b>« {query.trim()} »</b>
                    </span>
                  </>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** « Gérer les tags »: rename, recolour or delete the official tags. */
export function ContactTagsManager({
  open,
  onOpenChange,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** After any change, so the board reloads its contacts. */
  onChanged: () => void;
}) {
  const [tags, setTags] = useState<ContactTagRow[] | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [newName, setNewName] = useState("");

  useEffect(() => {
    if (open) fetchContactTags(true).then(setTags);
    else setEditing(null);
  }, [open]);

  const patch = async (id: string, body: Partial<ContactTagRow>) => {
    const r = await fetch(`/api/contact-tags/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      toast.error(data.error || "Modification impossible");
      return false;
    }
    setTags((prev) => prev?.map((t) => (t.id === id ? { ...t, ...data } : t)) ?? null);
    cache = null;
    onChanged();
    return true;
  };

  const remove = async (t: ContactTagRow) => {
    if (
      !window.confirm(
        `Supprimer le tag « ${t.name} » ? Il sera retiré de ${t.count ?? 0} contact${(t.count ?? 0) > 1 ? "s" : ""}.`
      )
    )
      return;
    const r = await fetch(`/api/contact-tags/${t.id}`, { method: "DELETE" });
    if (!r.ok) return toast.error("Suppression impossible");
    setTags((prev) => prev?.filter((x) => x.id !== t.id) ?? null);
    cache = null;
    onChanged();
  };

  const add = async () => {
    const name = newName.trim();
    if (!name) return;
    const r = await fetch("/api/contact-tags", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, color: nextColor((tags ?? []).length) }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return toast.error(data.error || "Création impossible");
    setTags((prev) =>
      prev?.some((t) => t.id === data.id)
        ? prev
        : [...(prev ?? []), data].sort((a, b) => a.name.localeCompare(b.name, "fr"))
    );
    setNewName("");
    cache = null;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tags className="h-5 w-5" /> Tags
          </DialogTitle>
          <DialogDescription>
            Les tags officiels, réutilisés d&apos;un contact à l&apos;autre et
            filtrables. Les mots-clés privés restent pour le reste.
          </DialogDescription>
        </DialogHeader>

        {!tags ? (
          <p className="py-6 text-center text-[13px] text-muted-foreground">
            Chargement…
          </p>
        ) : (
          <ul className="space-y-1.5">
            {tags.length === 0 && (
              <li className="rounded-2xl bg-secondary/60 px-4 py-5 text-center text-[13px] text-muted-foreground">
                Aucun tag.
              </li>
            )}
            {tags.map((t) => (
              <li key={t.id} className="rounded-2xl bg-secondary/60 p-2.5">
                <div className="flex items-center gap-2.5">
                  {editing === t.id ? (
                    <form
                      className="flex flex-1 items-center gap-1.5"
                      onSubmit={async (e) => {
                        e.preventDefault();
                        if (await patch(t.id, { name: draft.trim() }))
                          setEditing(null);
                      }}
                    >
                      <Input
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        maxLength={40}
                        autoFocus
                        className="h-9"
                        aria-label="Nom du tag"
                      />
                      <Button size="sm" type="submit" disabled={!draft.trim()}>
                        <Check className="h-4 w-4" />
                      </Button>
                    </form>
                  ) : (
                    <>
                      <TagChip tag={t} />
                      <span className="flex-1 text-[12px] tabular-nums text-muted-foreground">
                        {t.count ?? 0} contact{(t.count ?? 0) > 1 ? "s" : ""}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setEditing(t.id);
                          setDraft(t.name);
                        }}
                        className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-card hover:text-foreground"
                        aria-label={`Renommer ${t.name}`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(t)}
                        className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-negative hover:text-negative-foreground"
                        aria-label={`Supprimer ${t.name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </div>
                <div className="mt-2 flex gap-1.5 pl-1">
                  {PROJECT_COLORS.map((c) => (
                    <button
                      key={c.hex}
                      type="button"
                      onClick={() => patch(t.id, { color: c.hex })}
                      aria-label={`${t.name} en ${c.name}`}
                      title={c.name}
                      className={cn(
                        "h-5 w-5 rounded-full ring-offset-2 ring-offset-secondary transition-shadow",
                        t.color === c.hex && "ring-2 ring-foreground"
                      )}
                      style={{ backgroundColor: c.hex }}
                    />
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}

        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nouveau tag"
            maxLength={40}
            aria-label="Nouveau tag"
          />
          <Button type="submit" disabled={!newName.trim()}>
            <Plus className="h-4 w-4" /> Ajouter
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
