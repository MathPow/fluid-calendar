"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { toast } from "sonner";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { useProjectStore } from "@/store/project";

export interface LinkOptions {
  projets: {
    id: string;
    slug: string;
    name: string;
    color: string | null;
    parentId: string | null;
    station: string;
    organisation: {
      id: string;
      name: string;
      isDefault: boolean;
      sortOrder: number;
    } | null;
    taskProjectId: string | null;
  }[];
  lists: {
    id: string;
    name: string;
    color: string | null;
    /** Set on a list filed under an organisation without a Projets project. */
    organisation?: {
      id: string;
      name: string;
      isDefault: boolean;
      sortOrder: number;
    } | null;
    _count: { tasks: number };
  }[];
}

/** Loads the Projets-tab projects and the unattached task lists. */
export function useLinkOptions(enabled = true) {
  const [options, setOptions] = useState<LinkOptions | null>(null);
  const reload = useCallback(async () => {
    try {
      const res = await fetch("/api/projects/link");
      if (res.ok) setOptions((await res.json()) as LinkOptions);
    } catch {
      /* the picker falls back to plain task lists */
    }
  }, []);
  useEffect(() => {
    if (enabled) reload();
  }, [enabled, reload]);
  return { options, reload };
}

const NONE = "none";
const AGENT = "agent:"; // a Projets project that has no task list yet

interface ProjectPickerProps {
  /** Task list id (model Project), or null. */
  value: string | null | undefined;
  onChange: (projectId: string | null) => void;
  id?: string;
}

/**
 * Project field for tasks: lists the projects of the Projets tab, grouped by
 * organisation. Picking one that has no task list yet creates it on the spot.
 * Task lists that aren't attached to any project are offered at the end.
 */
export function ProjectPicker({ value, onChange, id }: ProjectPickerProps) {
  const { fetchProjects } = useProjectStore();
  const { options, reload } = useLinkOptions();
  const [busy, setBusy] = useState(false);

  const groups = useMemo(() => {
    if (!options) return [];
    const byOrg = new Map<
      string,
      { title: string; rank: number; items: LinkOptions["projets"] }
    >();
    for (const p of options.projets) {
      const key = p.organisation?.id ?? "perso";
      const g = byOrg.get(key) ?? {
        title: p.organisation?.name ?? "Perso",
        rank: p.organisation ? p.organisation.sortOrder : 1000,
        items: [],
      };
      g.items.push(p);
      byOrg.set(key, g);
    }
    // Lists filed under an organisation (a synced board, say) sit with its projects.
    for (const l of options.lists) {
      if (!l.organisation) continue;
      const g = byOrg.get(l.organisation.id) ?? {
        title: l.organisation.name,
        rank: l.organisation.sortOrder,
        items: [],
      };
      g.items.push({
        id: `list:${l.id}`,
        slug: "",
        name: l.name,
        color: l.color,
        parentId: null,
        station: "",
        organisation: l.organisation,
        taskProjectId: l.id,
      });
      byOrg.set(l.organisation.id, g);
    }
    return [...byOrg.values()]
      .sort((a, b) => a.rank - b.rank || a.title.localeCompare(b.title, "fr"))
      .map((g) => {
        // Parents first, each followed by its sub-projects.
        const tops = g.items.filter(
          (p) => !p.parentId || !g.items.some((x) => x.id === p.parentId)
        );
        const ordered = tops.flatMap((t) => [
          t,
          ...g.items.filter((c) => c.parentId === t.id),
        ]);
        return { ...g, items: ordered };
      });
  }, [options]);

  const handle = async (v: string) => {
    if (v === NONE) return onChange(null);
    if (!v.startsWith(AGENT)) return onChange(v);
    setBusy(true);
    try {
      const res = await fetch("/api/projects/link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ agentProjectId: v.slice(AGENT.length) }),
      });
      if (!res.ok) throw new Error(`Erreur ${res.status}`);
      const list = (await res.json()) as { id: string };
      await Promise.all([fetchProjects(), reload()]);
      onChange(list.id);
    } catch (e) {
      toast.error("Could not attach the project", {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Select value={value || NONE} onValueChange={handle} disabled={busy}>
      <SelectTrigger id={id}>
        <SelectValue placeholder="No Project" />
      </SelectTrigger>
      <SelectContent className="max-h-80">
        <SelectItem value={NONE}>No Project</SelectItem>
        {groups.map((g) => (
          <SelectGroup key={g.title}>
            <SelectSeparator />
            <SelectLabel>{g.title}</SelectLabel>
            {g.items.map((p) => (
              <SelectItem
                key={p.id}
                value={p.taskProjectId ?? `${AGENT}${p.id}`}
              >
                <span className="inline-flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: p.color ?? "#a8ccff" }}
                  />
                  {p.parentId && (
                    <span className="text-muted-foreground">↳</span>
                  )}
                  {p.name}
                </span>
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
        {options && options.lists.some((l) => !l.organisation) && (
          <SelectGroup>
            <SelectSeparator />
            <SelectLabel>Task lists (not in Projets)</SelectLabel>
            {options.lists
              .filter((l) => !l.organisation)
              .map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  <span className="inline-flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{
                        backgroundColor: l.color ?? "hsl(var(--border))",
                      }}
                    />
                    {l.name}
                  </span>
                </SelectItem>
              ))}
          </SelectGroup>
        )}
      </SelectContent>
    </Select>
  );
}
