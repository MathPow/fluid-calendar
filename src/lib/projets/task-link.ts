import { Prisma } from "@prisma/client";

/**
 * The link between a task list (model `Project`, used by Tasks and Calendar)
 * and a project of the Projets tab (model `AgentProject`). When linked, the
 * Projets project is the source of truth for name and colour.
 */
export const taskProjectInclude = {
  _count: { select: { tasks: true } },
  // Its own organisation, for a list with no Projets project.
  organisation: {
    select: {
      id: true,
      name: true,
      color: true,
      image: true,
      kind: true,
      isDefault: true,
      sortOrder: true,
    },
  },
  agentProject: {
    select: {
      id: true,
      slug: true,
      name: true,
      color: true,
      organisation: {
        select: {
          id: true,
          name: true,
          color: true,
          image: true,
          kind: true,
          isDefault: true,
          sortOrder: true,
        },
      },
    },
  },
} satisfies Prisma.ProjectInclude;

export type TaskProjectRow = Prisma.ProjectGetPayload<{
  include: typeof taskProjectInclude;
}>;

/** What the API returns: linked lists take the Projets project's name and colour. */
export function presentTaskProject<T extends TaskProjectRow>(p: T) {
  if (!p.agentProject) return p;
  return {
    ...p,
    name: p.agentProject.name,
    color: p.agentProject.color ?? p.color,
  };
}
