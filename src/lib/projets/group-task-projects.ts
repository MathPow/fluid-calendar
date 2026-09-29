import type { Project } from "@/types/project";

export type TaskProjectGroup = {
  key: string;
  name: string;
  color: string | null;
  projects: Project[];
};

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
    const org = project.agentProject?.organisation;
    const key = org?.id ?? "none";
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        name: org?.name ?? "Sans organisation",
        color: org?.color ?? null,
        // The user's organisation order; unlinked lists at the very end.
        rank: org ? [0, org.sortOrder ?? 0] : [1, 0],
        projects: [],
      };
      groups.set(key, group);
    }
    group.projects.push(project);
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
      projects: [...g.projects].sort((a, b) =>
        a.name.localeCompare(b.name, "fr")
      ),
    }));
}
