"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { toast } from "sonner";

import { Label } from "@/components/ui/label";
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

import { useT } from "@/i18n/client";
import { isOrgOwnList } from "@/lib/projets/group-task-projects";

import { useProjectStore } from "@/store/project";

export interface LinkOptions {
  organisations?: {
    id: string;
    name: string;
    color: string | null;
    kind: string;
    isDefault: boolean;
    sortOrder: number;
  }[];
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
  const t = useT();
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
        title: p.organisation?.name ?? t("common.perso"),
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
        const ordered = tops.flatMap((top) => [
          top,
          ...g.items.filter((c) => c.parentId === top.id),
        ]);
        return { ...g, items: ordered };
      });
  }, [options, t]);

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
      if (!res.ok) throw new Error(t("common.httpError", { status: res.status }));
      const list = (await res.json()) as { id: string };
      await Promise.all([fetchProjects(), reload()]);
      onChange(list.id);
    } catch (e) {
      toast.error(t("toasts.projects.attachFailed"), {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Select value={value || NONE} onValueChange={handle} disabled={busy}>
      <SelectTrigger id={id}>
        <SelectValue placeholder={t("tasks.projectPicker.none")} />
      </SelectTrigger>
      <SelectContent className="max-h-80">
        <SelectItem value={NONE}>{t("tasks.projectPicker.none")}</SelectItem>
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
            <SelectLabel>{t("tasks.projectPicker.unlinkedLists")}</SelectLabel>
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

const ORG_ONLY = "__org_only__";

/**
 * A task's organisation, then (optionally) one of its projects. Picking an
 * organisation alone files the task in the organisation's own list, created
 * on the spot if it doesn't exist yet; the project field opens once an
 * organisation is chosen.
 */
export function OrgProjectPicker({ value, onChange, id }: ProjectPickerProps) {
  const t = useT();
  const { fetchProjects } = useProjectStore();
  const { options, reload } = useLinkOptions();
  const [busy, setBusy] = useState(false);
  const [pickedOrg, setPickedOrg] = useState<string | null>(null);

  const orgs = useMemo(() => options?.organisations ?? [], [options]);
  const defaultOrg = orgs.find((o) => o.isDefault);
  const orgOfProjet = useCallback(
    (p: LinkOptions["projets"][number]) => p.organisation?.id ?? defaultOrg?.id ?? null,
    [defaultOrg]
  );

  // Where the current list sits: its organisation, and whether it is the
  // organisation's own list (« organisation seulement »).
  const current = useMemo(() => {
    if (!value || !options) return { orgId: null as string | null, own: false };
    const projet = options.projets.find((p) => p.taskProjectId === value);
    if (projet) return { orgId: orgOfProjet(projet), own: false };
    const list = options.lists.find((l) => l.id === value);
    if (list?.organisation) {
      const org = orgs.find((o) => o.id === list.organisation!.id);
      return { orgId: list.organisation.id, own: isOrgOwnList(list.name, org) };
    }
    return { orgId: null, own: false };
  }, [value, options, orgs, orgOfProjet]);

  const orgId = pickedOrg ?? current.orgId;
  useEffect(() => setPickedOrg(null), [value]);

  // The chosen organisation's projects: Projets projects (with or without a
  // task list yet) and its other lists (a synced board…).
  const projects = useMemo(() => {
    if (!options || !orgId) return [];
    const org = orgs.find((o) => o.id === orgId);
    const fromProjets = options.projets
      .filter((p) => orgOfProjet(p) === orgId)
      .map((p) => ({ key: p.taskProjectId ?? `${AGENT}${p.id}`, name: p.name, color: p.color, sub: !!p.parentId }));
    const fromLists = options.lists
      .filter((l) => l.organisation?.id === orgId && !isOrgOwnList(l.name, org))
      .map((l) => ({ key: l.id, name: l.name, color: l.color, sub: false }));
    return [...fromProjets, ...fromLists];
  }, [options, orgId, orgs, orgOfProjet]);

  const ownListOf = async (id: string): Promise<string> => {
    const org = orgs.find((o) => o.id === id);
    const existing = options?.lists.find((l) => l.organisation?.id === id && isOrgOwnList(l.name, org));
    if (existing) return existing.id;
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: org?.name ?? t("tasks.projectPicker.org"), organisationId: id, color: org?.color ?? undefined }),
    });
    if (!res.ok) throw new Error(t("common.httpError", { status: res.status }));
    const list = (await res.json()) as { id: string };
    await Promise.all([fetchProjects(), reload()]);
    return list.id;
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast.error(t("toasts.tasks.classifyFailed"), { description: e instanceof Error ? e.message : undefined });
    } finally {
      setBusy(false);
    }
  };

  const pickOrg = (v: string) =>
    run(async () => {
      if (v === NONE) {
        setPickedOrg(null);
        return onChange(null);
      }
      setPickedOrg(v);
      onChange(await ownListOf(v));
    });

  const pickProject = (v: string) =>
    run(async () => {
      if (!orgId) return;
      if (v === ORG_ONLY) return onChange(await ownListOf(orgId));
      if (!v.startsWith(AGENT)) return onChange(v);
      const res = await fetch("/api/projects/link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ agentProjectId: v.slice(AGENT.length) }),
      });
      if (!res.ok) throw new Error(t("common.httpError", { status: res.status }));
      const list = (await res.json()) as { id: string };
      await Promise.all([fetchProjects(), reload()]);
      onChange(list.id);
    });

  const projectValue = !value || current.own || current.orgId !== orgId ? ORG_ONLY : value;

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor={id}>{t("tasks.projectPicker.organisation")}</Label>
        <Select value={orgId ?? NONE} onValueChange={pickOrg} disabled={busy}>
          <SelectTrigger id={id}>
            <SelectValue placeholder={t("tasks.projectPicker.noneF")} />
          </SelectTrigger>
          <SelectContent className="max-h-80">
            <SelectItem value={NONE}>{t("tasks.projectPicker.noneF")}</SelectItem>
            {orgs.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                <span className="inline-flex items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: o.color ?? "#d9d4cc" }} />
                  {o.name}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>{t("tasks.projectPicker.project")}</Label>
        <Select value={projectValue} onValueChange={pickProject} disabled={busy || !orgId}>
          <SelectTrigger>
            <SelectValue placeholder={orgId ? t("tasks.projectPicker.orgOnly") : t("tasks.projectPicker.pickOrgFirst")} />
          </SelectTrigger>
          <SelectContent className="max-h-80">
            <SelectItem value={ORG_ONLY}>{t("tasks.projectPicker.orgOnly")}</SelectItem>
            {projects.map((p) => (
              <SelectItem key={p.key} value={p.key}>
                <span className="inline-flex items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: p.color ?? "#a8ccff" }} />
                  {p.sub && <span className="text-muted-foreground">↳</span>}
                  {p.name}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
