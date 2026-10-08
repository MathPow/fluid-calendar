"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import Link from "next/link";

import { Archive, ExternalLink, Plus } from "lucide-react";
import { toast } from "sonner";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";

/**
 * « Pense-bête »: quick little notes on the dashboard. Each one is a real
 * note in the vault's Pense-bête folder (so Notes / Obsidian have it too),
 * optionally tied to an organisation, whose colour tints the card. Archiving
 * takes it off the board and files it under Pense-bête/Archives.
 */

interface Sticky {
  path: string;
  text: string;
  organisation: string | null;
  created: string | null;
  /** Still being written to the vault. */
  pending?: boolean;
}

interface Org {
  id: string;
  slug: string;
  name: string;
  color: string | null;
}

const LAST_ORG_KEY = "sticky-notes-org";

const readLastOrg = () => {
  try {
    return localStorage.getItem(LAST_ORG_KEY);
  } catch {
    return null;
  }
};
const writeLastOrg = (slug: string | null) => {
  try {
    if (slug) localStorage.setItem(LAST_ORG_KEY, slug);
    else localStorage.removeItem(LAST_ORG_KEY);
  } catch {
    // private mode: just don't remember it
  }
};

/** A hex colour with an alpha suffix, for the soft card tint. */
const tint = (hex: string | null | undefined, alpha: string) =>
  hex && /^#[0-9a-f]{6}$/i.test(hex) ? `${hex}${alpha}` : undefined;

export function StickyNotesWidget({ preset }: { preset: string }) {
  const t = useT();
  const [notes, setNotes] = useState<Sticky[] | null>(null);
  const [configured, setConfigured] = useState(true);
  const [failed, setFailed] = useState(false);
  const [folder, setFolder] = useState("/Pense-bête");
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [draft, setDraft] = useState("");
  const [draftOrg, setDraftOrg] = useState<string | null>(null);
  // Bumped on every change made here, so a slower list fetch that started
  // before it doesn't overwrite it.
  const changes = useRef(0);

  const load = useCallback(async () => {
    const started = changes.current;
    try {
      const res = await fetch("/api/notes/sticky");
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (changes.current !== started) return;
      setConfigured(data.configured !== false);
      if (data.folder) setFolder(data.folder);
      setNotes(data.notes ?? []);
      setFailed(false);
    } catch {
      setFailed(true);
      setNotes((n) => n ?? []);
    }
  }, []);

  useEffect(() => {
    load();
    setDraftOrg(readLastOrg());
    fetch("/api/organisations")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: Org[]) => setOrgs(rows))
      .catch(() => undefined);
    // Notes added from Obsidian / Notes show up when you come back.
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  const orgOf = (slug: string | null) =>
    slug ? orgs.find((o) => o.slug === slug) : undefined;

  const patch = async (path: string, body: Record<string, unknown>) => {
    const res = await fetch("/api/notes/sticky", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, ...body }),
    });
    if (!res.ok) throw new Error();
  };

  const add = async () => {
    const text = draft.trim();
    if (!text) return;
    changes.current++;
    const temp = `pending:${Date.now()}:${Math.random()}`;
    const organisation = draftOrg;
    setDraft("");
    setNotes((n) => [
      {
        path: temp,
        text,
        organisation,
        created: new Date().toISOString(),
        pending: true,
      },
      ...(n ?? []),
    ]);
    try {
      const res = await fetch("/api/notes/sticky", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, organisation }),
      });
      if (!res.ok) throw new Error();
      const { path } = await res.json();
      setNotes((n) =>
        (n ?? []).map((x) =>
          x.path === temp ? { ...x, path, pending: false } : x
        )
      );
    } catch {
      setNotes((n) => (n ?? []).filter((x) => x.path !== temp));
      setDraft((d) => d || text);
      toast.error(t("dashboard.sticky.saveFailed"));
    }
  };

  const edit = async (note: Sticky, patchBody: Partial<Sticky>) => {
    changes.current++;
    const before = notes;
    setNotes((n) =>
      (n ?? []).map((x) => (x.path === note.path ? { ...x, ...patchBody } : x))
    );
    try {
      await patch(note.path, patchBody);
    } catch {
      setNotes(before);
      toast.error(t("dashboard.sticky.saveFailed"));
    }
  };

  const archive = async (note: Sticky) => {
    changes.current++;
    const before = notes;
    setNotes((n) => (n ?? []).filter((x) => x.path !== note.path));
    try {
      await patch(note.path, { archive: true });
      toast.success(t("dashboard.sticky.archived"));
    } catch {
      setNotes(before);
      toast.error(t("dashboard.sticky.saveFailed"));
    }
  };

  const column = preset === "column";
  const cols =
    preset === "wide"
      ? "grid-cols-2 lg:grid-cols-4"
      : column
        ? "grid-cols-1"
        : "grid-cols-2";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-3">
        <p className="etiquette">{t("dashboard.sections.sticky")}</p>
        <Link
          href={`/notes?path=${encodeURIComponent(folder)}`}
          className="text-[12px] font-medium text-muted-foreground hover:text-foreground"
        >
          {t("dashboard.sticky.inNotes")}
        </Link>
      </div>

      {/* Composer */}
      <div className="mt-3 flex shrink-0 items-start gap-2 rounded-2xl bg-secondary/70 p-1.5 pl-2">
        <OrgPicker
          orgs={orgs}
          value={draftOrg}
          onChange={(slug) => {
            setDraftOrg(slug);
            writeLastOrg(slug);
          }}
        />
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              add();
            }
          }}
          rows={1}
          placeholder={t("dashboard.sticky.placeholder")}
          className="max-h-24 min-h-8 flex-1 resize-none border-0 bg-transparent py-1.5 shadow-none focus-visible:ring-0 text-[13px] outline-none [field-sizing:content] placeholder:text-muted-foreground"
          disabled={!configured}
        />
        <button
          type="button"
          onClick={add}
          disabled={!draft.trim()}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-foreground text-background disabled:opacity-30"
          aria-label={t("dashboard.sticky.add")}
          title={t("dashboard.sticky.add")}
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
        {!configured ? (
          <p className="py-4 text-[13px] text-muted-foreground">
            {t("dashboard.sticky.notConfigured")}
          </p>
        ) : notes === null ? (
          <p className="py-4 text-[13px] text-muted-foreground">
            {t("common.loading")}
          </p>
        ) : failed && notes.length === 0 ? (
          <p className="py-4 text-[13px] text-muted-foreground">
            {t("dashboard.sticky.loadFailed")}
          </p>
        ) : notes.length === 0 ? (
          <p className="py-4 text-[13px] text-muted-foreground">
            {t("dashboard.sticky.empty")}
          </p>
        ) : (
          <ul className={cn("grid gap-2 pb-1", cols)}>
            {notes.map((n) => (
              <StickyCard
                key={n.path}
                note={n}
                org={orgOf(n.organisation)}
                orgs={orgs}
                onText={(text) => edit(n, { text })}
                onOrg={(organisation) => edit(n, { organisation })}
                onArchive={() => archive(n)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function StickyCard({
  note,
  org,
  orgs,
  onText,
  onOrg,
  onArchive,
}: {
  note: Sticky;
  org: Org | undefined;
  orgs: Org[];
  onText: (text: string) => void;
  onOrg: (slug: string | null) => void;
  onArchive: () => void;
}) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(note.text);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!editing) setValue(note.text);
  }, [note.text, editing]);
  useEffect(() => {
    if (editing) {
      const el = ref.current;
      el?.focus();
      el?.setSelectionRange(el.value.length, el.value.length);
    }
  }, [editing]);

  const commit = () => {
    setEditing(false);
    const text = value.trim();
    if (text && text !== note.text) onText(text);
    else setValue(note.text);
  };

  return (
    <li
      className="group relative flex min-h-[84px] flex-col rounded-xl border-l-[3px] bg-secondary/60 p-2.5 pr-2"
      style={{
        backgroundColor: tint(org?.color, "1f"),
        borderLeftColor: org?.color ?? "transparent",
      }}
    >
      {note.pending ? (
        <p className="flex-1 whitespace-pre-wrap break-words text-[13px] leading-snug opacity-60">
          {note.text}
        </p>
      ) : editing ? (
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setValue(note.text);
              setEditing(false);
            } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              commit();
            }
          }}
          className="min-h-16 flex-1 resize-none border-0 bg-transparent p-0 text-[13px] shadow-none focus-visible:ring-0 leading-snug outline-none [field-sizing:content]"
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="flex-1 whitespace-pre-wrap break-words text-left text-[13px] leading-snug"
          title={t("dashboard.sticky.edit")}
        >
          {note.text}
        </button>
      )}
      <div
        className={cn(
          "mt-2 flex items-center gap-1",
          note.pending && "pointer-events-none opacity-40"
        )}
      >
        <OrgPicker orgs={orgs} value={note.organisation} onChange={onOrg} small />
        <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
          {org?.name ?? ""}
        </span>
        <Link
          href={`/notes?path=${encodeURIComponent(note.path)}`}
          className="rounded-md p-1 text-muted-foreground opacity-60 hover:bg-background/60 hover:text-foreground group-hover:opacity-100"
          title={t("dashboard.sticky.open")}
          aria-label={t("dashboard.sticky.open")}
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </Link>
        <button
          type="button"
          onClick={onArchive}
          className="rounded-md p-1 text-muted-foreground opacity-60 hover:bg-background/60 hover:text-foreground group-hover:opacity-100"
          title={t("dashboard.sticky.archive")}
          aria-label={t("dashboard.sticky.archive")}
        >
          <Archive className="h-3.5 w-3.5" />
        </button>
      </div>
    </li>
  );
}

/** Colour dot that opens the organisation list (or « Aucune »). */
function OrgPicker({
  orgs,
  value,
  onChange,
  small,
}: {
  orgs: Org[];
  value: string | null;
  onChange: (slug: string | null) => void;
  small?: boolean;
}) {
  const t = useT();
  const current = value ? orgs.find((o) => o.slug === value) : undefined;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex shrink-0 items-center justify-center rounded-full hover:bg-background/60",
            small ? "h-6 w-6" : "h-8 w-8"
          )}
          title={current?.name ?? t("dashboard.sticky.organisation")}
          aria-label={t("dashboard.sticky.organisation")}
        >
          <span
            className={cn(
              "rounded-full border",
              small ? "h-3 w-3" : "h-3.5 w-3.5",
              current ? "border-transparent" : "border-dashed border-muted-foreground"
            )}
            style={{ backgroundColor: current?.color ?? undefined }}
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
        <DropdownMenuItem onSelect={() => onChange(null)}>
          <span className="h-3 w-3 rounded-full border border-dashed border-muted-foreground" />
          {t("dashboard.sticky.noOrganisation")}
        </DropdownMenuItem>
        {orgs.map((o) => (
          <DropdownMenuItem key={o.id} onSelect={() => onChange(o.slug)}>
            <span
              className="h-3 w-3 rounded-full"
              style={{ backgroundColor: o.color ?? "#a3a3a3" }}
            />
            <span className={cn(o.slug === value && "font-semibold")}>
              {o.name}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
