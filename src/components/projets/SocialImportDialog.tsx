"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { useRouter } from "next/navigation";

import { useT } from "@/i18n/client";
import { Check, FileUp, Loader2, Search, Users, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";

import {
  type ImportPlatform,
  type ParsedExport,
  type SocialCandidate,
  candidateKeys,
  existingIndex,
  readExports,
} from "@/lib/contacts/social-import";
import { initials } from "@/lib/projets/meta";
import type { ContactFull } from "@/lib/projets/queries";
import { cn } from "@/lib/utils";

import { Avatar } from "./ImageField";
import { SocialIcon } from "./social-links";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contacts: ContactFull[];
}

const PLATFORMS: { id: ImportPlatform; label: string; exportUrl: string }[] = [
  {
    id: "linkedin",
    label: "LinkedIn",
    exportUrl: "https://www.linkedin.com/mypreferences/d/download-my-data",
  },
  {
    id: "instagram",
    label: "Instagram",
    exportUrl: "https://accountscenter.instagram.com/info_and_permissions/dyi/",
  },
  {
    id: "facebook",
    label: "Facebook",
    exportUrl: "https://accountscenter.facebook.com/info_and_permissions/dyi/",
  },
];

type View = "new" | "dismissed";
const PAGE = 150;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Contacts → "Importer des réseaux": drop the data exports of LinkedIn,
 * Instagram and Facebook, see everyone who isn't a contact yet, tick who to
 * keep. The rest can be remembered as left out so the next import (a fresher
 * export) only offers the newcomers.
 */
export function SocialImportDialog({ open, onOpenChange, contacts }: Props) {
  const t = useT();
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [reading, setReading] = useState(false);
  const [parsed, setParsed] = useState<ParsedExport | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [platform, setPlatform] = useState<ImportPlatform | "all">("all");
  const [onlyMutual, setOnlyMutual] = useState(false);
  const [view, setView] = useState<View>("new");
  const [limit, setLimit] = useState(PAGE);
  const [rememberRest, setRememberRest] = useState(true);
  const [saving, setSaving] = useState(false);

  // Fresh start each time it opens.
  useEffect(() => {
    if (!open) return;
    setFiles([]);
    setParsed(null);
    setPicked(new Set());
    setQuery("");
    setPlatform("all");
    setOnlyMutual(false);
    setView("new");
    setLimit(PAGE);
    fetch("/api/contacts/import")
      .then((r) => (r.ok ? r.json() : { dismissed: [] }))
      .then((d: { dismissed: string[] }) => setDismissed(new Set(d.dismissed)))
      .catch(() => setDismissed(new Set()));
  }, [open]);

  const read = async () => {
    setReading(true);
    try {
      const result = await readExports(files);
      setParsed(result);
      if (result.candidates.length === 0)
        toast.error(t("contacts.import.nothingFound"));
    } catch (e) {
      toast.error(t("contacts.import.readFailed"), {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setReading(false);
    }
  };

  // Who's new, who's already a contact, who was left out before.
  const groups = useMemo(() => {
    const fresh: SocialCandidate[] = [];
    const left: SocialCandidate[] = [];
    let known = 0;
    if (!parsed) return { fresh, left, known };
    const index = existingIndex(contacts);
    for (const c of parsed.candidates) {
      if (index.has(c)) known++;
      else if (candidateKeys(c).some((k) => dismissed.has(k))) left.push(c);
      else fresh.push(c);
    }
    const byName = (a: SocialCandidate, b: SocialCandidate) =>
      a.name.localeCompare(b.name, "fr");
    return { fresh: fresh.sort(byName), left: left.sort(byName), known };
  }, [parsed, contacts, dismissed]);

  const pool = view === "new" ? groups.fresh : groups.left;
  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of pool) for (const s of c.sources) m[s] = (m[s] ?? 0) + 1;
    return m;
  }, [pool]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return pool.filter((c) => {
      if (platform !== "all" && !c.sources.includes(platform)) return false;
      if (onlyMutual && !c.mutual) return false;
      if (!q) return true;
      return [c.name, c.company, c.role, c.email]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(q));
    });
  }, [pool, query, platform, onlyMutual]);

  const toggle = (key: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const allVisiblePicked =
    visible.length > 0 && visible.every((c) => picked.has(c.key));
  const toggleAllVisible = () =>
    setPicked((prev) => {
      const next = new Set(prev);
      for (const c of visible) {
        if (allVisiblePicked) next.delete(c.key);
        else next.add(c.key);
      }
      return next;
    });

  const all = useMemo(() => [...groups.fresh, ...groups.left], [groups]);
  const keep = all.filter((c) => picked.has(c.key));
  const rest = groups.fresh.filter((c) => !picked.has(c.key));

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/contacts/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          create: keep.map((c) => ({
            type: "person",
            name: c.name.slice(0, 120),
            email:
              c.email && EMAIL.test(c.email) ? c.email.slice(0, 200) : null,
            company: c.company?.slice(0, 120) || null,
            role: c.role?.slice(0, 80) || null,
            // The network as a private keyword: "linkedin" finds them all.
            tags: c.sources,
            links: c.links.map((l) => ({
              platform: l.platform,
              value: l.value.slice(0, 300),
            })),
          })),
          dismiss: rememberRest
            ? rest.flatMap((c) =>
                candidateKeys(c).map((key) => ({
                  key,
                  name: c.name.slice(0, 200),
                }))
              )
            : [],
        }),
      });
      if (!res.ok) throw new Error(t("errors.status", { status: res.status }));
      toast.success(
        t(
          keep.length > 1
            ? "contacts.import.donePlural"
            : "contacts.import.done",
          {
            count: keep.length,
          }
        )
      );
      onOpenChange(false);
      router.refresh();
    } catch (e) {
      toast.error(t("contacts.import.saveFailed"), {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  const forgetDismissed = async () => {
    const res = await fetch("/api/contacts/import", { method: "DELETE" }).catch(
      () => null
    );
    if (!res?.ok) return toast.error(t("contacts.import.saveFailed"));
    setDismissed(new Set());
    setView("new");
  };

  const subtitle = (c: SocialCandidate) => {
    const bits: string[] = [];
    if (c.role || c.company)
      bits.push([c.role, c.company].filter(Boolean).join(" · "));
    if (c.mutual) bits.push(t("contacts.import.mutual"));
    else if (c.follow === "follower")
      bits.push(t("contacts.import.followsYou"));
    else if (c.follow === "following")
      bits.push(t("contacts.import.youFollow"));
    if (c.since) bits.push(t("contacts.import.since", { date: c.since }));
    return bits.join(" · ");
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="flex max-h-[90dvh] max-w-2xl flex-col gap-0 overflow-y-hidden p-0 md:p-0">
        <DialogHeader className="space-y-1.5 px-6 pb-4 pt-6 md:px-8 md:pt-8">
          <DialogTitle>{t("contacts.import.title")}</DialogTitle>
          <DialogDescription>
            {parsed
              ? t("contacts.import.reviewHint")
              : t("contacts.import.description")}
          </DialogDescription>
        </DialogHeader>

        {!parsed ? (
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 pb-6 md:px-8 md:pb-8">
            <ol className="space-y-3">
              {PLATFORMS.map((p) => (
                <li
                  key={p.id}
                  className="flex gap-3 rounded-2xl bg-secondary p-4"
                >
                  <SocialIcon
                    platform={p.id}
                    className="mt-0.5 h-5 w-5 shrink-0"
                  />
                  <div className="min-w-0 text-[13px]">
                    <p className="font-semibold">{p.label}</p>
                    <p className="mt-0.5 text-muted-foreground">
                      {t(`contacts.import.how.${p.id}`)}
                    </p>
                    <a
                      href={p.exportUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-block font-medium underline underline-offset-2"
                    >
                      {t("contacts.import.openExport")}
                    </a>
                  </div>
                </li>
              ))}
            </ol>

            <input
              ref={fileInput}
              type="file"
              multiple
              accept=".zip,.csv,.json,.html,application/zip"
              className="hidden"
              onChange={(e) => {
                const list = Array.from(e.target.files ?? []);
                setFiles((prev) => [...prev, ...list]);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                setFiles((prev) => [
                  ...prev,
                  ...Array.from(e.dataTransfer.files),
                ]);
              }}
              className="flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-border px-6 py-8 text-center transition-colors hover:bg-secondary"
            >
              <FileUp className="h-6 w-6 text-muted-foreground" />
              <span className="text-[14px] font-medium">
                {t("contacts.import.drop")}
              </span>
              <span className="text-[12px] text-muted-foreground">
                {t("contacts.import.dropHint")}
              </span>
            </button>

            {files.length > 0 && (
              <ul className="space-y-1.5">
                {files.map((f, i) => (
                  <li
                    key={`${f.name}-${i}`}
                    className="flex items-center gap-2 rounded-xl bg-secondary px-3 py-2 text-[13px]"
                  >
                    <span className="min-w-0 flex-1 truncate">{f.name}</span>
                    <span className="shrink-0 text-[12px] text-muted-foreground">
                      {(f.size / 1024 / 1024).toFixed(1)} Mo
                    </span>
                    <button
                      type="button"
                      aria-label={t("contacts.import.removeFile")}
                      onClick={() =>
                        setFiles((prev) => prev.filter((_, j) => j !== i))
                      }
                      className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-border/70"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                {t("contacts.import.cancel")}
              </Button>
              <Button onClick={read} disabled={files.length === 0 || reading}>
                {reading ? <Loader2 className="animate-spin" /> : <Users />}
                {t("contacts.import.read")}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="space-y-3 px-6 pb-3 md:px-8">
              <p className="text-[12px] text-muted-foreground">
                {t("contacts.import.summary", {
                  fresh: groups.fresh.length,
                  known: groups.known,
                  left: groups.left.length,
                })}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <div className="segmented h-9">
                  <button
                    type="button"
                    className="segmented-item"
                    data-active={view === "new"}
                    onClick={() => {
                      setView("new");
                      setLimit(PAGE);
                    }}
                  >
                    {t("contacts.import.view.new", {
                      count: groups.fresh.length,
                    })}
                  </button>
                  <button
                    type="button"
                    className="segmented-item"
                    data-active={view === "dismissed"}
                    onClick={() => {
                      setView("dismissed");
                      setLimit(PAGE);
                    }}
                    disabled={groups.left.length === 0}
                  >
                    {t("contacts.import.view.dismissed", {
                      count: groups.left.length,
                    })}
                  </button>
                </div>
                {(["all", ...PLATFORMS.map((p) => p.id)] as const)
                  .filter((p) => p === "all" || counts[p])
                  .map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => {
                        setPlatform(p);
                        setLimit(PAGE);
                      }}
                      aria-pressed={platform === p}
                      className={cn(
                        "inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[12px] font-medium transition-colors",
                        platform === p
                          ? "bg-foreground text-background"
                          : "bg-secondary hover:bg-border/70"
                      )}
                    >
                      {p === "all" ? (
                        t("contacts.import.allNetworks")
                      ) : (
                        <>
                          <SocialIcon platform={p} className="h-3.5 w-3.5" />
                          {counts[p]}
                        </>
                      )}
                    </button>
                  ))}
                {(counts.instagram ?? 0) > 0 && (
                  <button
                    type="button"
                    onClick={() => setOnlyMutual((v) => !v)}
                    aria-pressed={onlyMutual}
                    className={cn(
                      "inline-flex h-9 items-center rounded-full px-3 text-[12px] font-medium transition-colors",
                      onlyMutual
                        ? "bg-foreground text-background"
                        : "bg-secondary hover:bg-border/70"
                    )}
                  >
                    {t("contacts.import.onlyMutual")}
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <div className="flex h-10 min-w-0 flex-1 items-center gap-2.5 rounded-full bg-secondary px-4">
                  <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <input
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setLimit(PAGE);
                    }}
                    placeholder={t("contacts.import.search")}
                    className="h-full min-w-0 flex-1 border-0 bg-transparent p-0 text-[14px] placeholder:text-muted-foreground focus:outline-none focus:ring-0"
                  />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={toggleAllVisible}
                  disabled={!visible.length}
                >
                  {allVisiblePicked
                    ? t("contacts.import.selectNone")
                    : t("contacts.import.selectAll")}
                </Button>
              </div>
            </div>

            <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto px-4 pb-3 md:px-6">
              {visible.length === 0 && (
                <li className="px-2 py-10 text-center text-[13px] text-muted-foreground">
                  {t("contacts.import.empty")}
                </li>
              )}
              {visible.slice(0, limit).map((c) => {
                const on = picked.has(c.key);
                return (
                  <li key={c.key}>
                    <button
                      type="button"
                      onClick={() => toggle(c.key)}
                      aria-pressed={on}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-2xl px-2.5 py-2 text-left transition-colors",
                        on ? "bg-tint-soft" : "hover:bg-secondary"
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border",
                          on
                            ? "border-foreground bg-foreground text-background"
                            : "border-border"
                        )}
                      >
                        {on && <Check className="h-3.5 w-3.5" />}
                      </span>
                      <Avatar
                        image={null}
                        fallback={initials(c.name)}
                        color="#a8ccff"
                        shape="round"
                        className="h-9 w-9 text-[12px]"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-semibold">
                          {c.name}
                        </span>
                        {subtitle(c) && (
                          <span className="block truncate text-[12px] text-muted-foreground">
                            {subtitle(c)}
                          </span>
                        )}
                      </span>
                      <span className="flex shrink-0 gap-1 text-muted-foreground">
                        {c.sources.map((s) => (
                          <SocialIcon
                            key={s}
                            platform={s}
                            className="h-3.5 w-3.5"
                          />
                        ))}
                      </span>
                    </button>
                  </li>
                );
              })}
              {visible.length > limit && (
                <li className="pt-2 text-center">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setLimit((l) => l + PAGE)}
                  >
                    {t("contacts.import.showMore", {
                      count: visible.length - limit,
                    })}
                  </Button>
                </li>
              )}
            </ul>

            <div className="space-y-3 border-t border-border px-6 py-4 md:px-8">
              {view === "new" ? (
                <label className="flex items-center gap-3 text-[13px]">
                  <Switch
                    checked={rememberRest}
                    onCheckedChange={setRememberRest}
                  />
                  <span className="min-w-0 flex-1">
                    {t("contacts.import.rememberRest", { count: rest.length })}
                  </span>
                </label>
              ) : (
                <button
                  type="button"
                  onClick={forgetDismissed}
                  className="text-[12px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
                >
                  {t("contacts.import.forgetDismissed")}
                </button>
              )}
              <div className="flex items-center justify-end gap-2">
                <Button
                  variant="ghost"
                  onClick={() => setParsed(null)}
                  disabled={saving}
                >
                  {t("contacts.import.back")}
                </Button>
                <Button
                  onClick={save}
                  disabled={
                    saving ||
                    (keep.length === 0 && (!rememberRest || rest.length === 0))
                  }
                >
                  {saving && <Loader2 className="animate-spin" />}
                  {keep.length > 0
                    ? t(
                        keep.length > 1
                          ? "contacts.import.keepPlural"
                          : "contacts.import.keep",
                        {
                          count: keep.length,
                        }
                      )
                    : t("contacts.import.keepNone")}
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
