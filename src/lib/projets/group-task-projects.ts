import type { Project } from "@/types/project";

export type TaskProjectGroup = {
  key: string;
  name: string;
  color: string | null;
  image: string | null;
  /**
   * The organisation's own list: not linked to a Projets project and named
   * like the organisation (« StayChum » under StayChum, « Personal » under
   * the personal one). Shown as the organisation line itself, not twice.
   */
  general: Project | null;
  projects: Project[];
};

const fold = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const PERSONAL_NAMES = new Set(["personal", "perso", "personnel", "personnelle"]);

function isGeneral(project: Project, org: { name: string; kind?: string } | null | undefined) {
  if (!org || project.agentProject) return false;
  const name = fold(project.name);
  return name === fold(org.name) || (org.kind === "perso" && PERSONAL_NAMES.has(name));
}

/**
 * Task lists grouped by the organisation of their Projets project, in the
 * Projets tab's order (organisations by sortOrder, as arranged with
 * « Réorganiser »), lists not linked to a Projets project at the very end.
 */
export function groupTaskProjects(projects: Project[]): TaskProjectGroup[] {
  const groups = new Map<
    string,
    TaskProjectGroup & { rank: [number, number] }
  >();
  for (const project of projects) {
    // The Projets project's organisation, else the list's own.
    const org = project.agentProject?.organisation ?? project.organisation;
    const key = org?.id ?? "none";
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        name: org?.name ?? "Sans organisation",
        color: org?.color ?? null,
        image: org?.image ?? null,
        general: null,
        // The user's organisation order; unlinked lists at the very end.
        rank: org ? [0, org.sortOrder ?? 0] : [1, 0],
        projects: [],
      };
      groups.set(key, group);
    }
    group.projects.push(project);
  }
  for (const g of groups.values()) {
    const org = g.projects[0]?.agentProject?.organisation ?? g.projects[0]?.organisation;
    const general = g.key === "none" ? undefined : g.projects.find((p) => isGeneral(p, org));
    if (general) {
      g.general = general;
      g.projects = g.projects.filter((p) => p !== general);
    }
  }
  return [...groups.values()]
    .sort(
      (a, b) =>
        a.rank[0] - b.rank[0] ||
        a.rank[1] - b.rank[1] ||
        a.name.localeCompare(b.name, "fr")
    )
    .map((g) => ({
      key: g.key,
      name: g.name,
      color: g.color,
      image: g.image,
      general: g.general,
      projects: [...g.projects].sort((a, b) =>
        a.name.localeCompare(b.name, "fr")
      ),
    }));
}
