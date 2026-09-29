"use client";

import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  LINK_KINDS,
  type LinkKind,
  guessLinkKind,
  normalizeUrl,
} from "@/lib/projets/meta";

import { LinkKindIcon } from "./link-icons";

export interface FormLink {
  kind: LinkKind;
  label: string;
  url: string;
}

/** Stored links → form rows (unknown kinds fall back to "other"). */
export function toFormLinks(
  links: { kind: string; label: string | null; url: string }[]
): FormLink[] {
  return links.map((l) => ({
    kind: (LINK_KINDS.some((k) => k.id === l.kind)
      ? l.kind
      : "other") as LinkKind,
    label: l.label ?? "",
    url: l.url,
  }));
}

/** Form rows → API payload: URLs normalised, empty rows dropped. */
export function toLinkPayload(links: FormLink[]) {
  return links
    .map((l) => ({
      kind: l.kind,
      label: l.label.trim() || null,
      url: normalizeUrl(l.url),
    }))
    .filter((l) => l.url);
}

/**
 * Editable list of links (Figma, Drive, site, GitHub…), shared by the project
 * and organisation dialogs.
 */
export function LinksEditor({
  links,
  onChange,
  hint = "Figma, Drive, site web, projet Claude, GitHub…",
}: {
  links: FormLink[];
  onChange: (links: FormLink[]) => void;
  hint?: string;
}) {
  const update = (i: number, patch: Partial<FormLink>) =>
    onChange(links.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  // Typing a Figma / Drive / GitHub… URL picks the matching kind unless the
  // user already chose a specific one.
  const updateUrl = (i: number, url: string) =>
    onChange(
      links.map((l, j) => {
        if (j !== i) return l;
        const guessed = guessLinkKind(url);
        const kind =
          guessed && (l.kind === "website" || l.kind === "other")
            ? guessed
            : l.kind;
        return { ...l, url, kind };
      })
    );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>Liens</Label>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() =>
            onChange([...links, { kind: "website", label: "", url: "" }])
          }
        >
          <Plus /> Ajouter un lien
        </Button>
      </div>
      {links.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">{hint}</p>
      ) : (
        <div className="space-y-2">
          {links.map((l, i) => (
            <div
              key={i}
              className="grid gap-2 rounded-2xl bg-secondary/60 p-2 sm:grid-cols-[9.5rem_1fr_9rem_auto]"
            >
              <Select
                value={l.kind}
                onValueChange={(v) => update(i, { kind: v as LinkKind })}
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
                onChange={(e) => updateUrl(i, e.target.value)}
                placeholder="https://…"
                className="h-10 bg-card"
                inputMode="url"
              />
              <Input
                value={l.label}
                onChange={(e) => update(i, { label: e.target.value })}
                placeholder="Libellé"
                className="h-10 bg-card"
              />
              <button
                type="button"
                onClick={() => onChange(links.filter((_, j) => j !== i))}
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
  );
}
