import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

import { slugify } from "./meta";

/** Everything a project tile or detail page needs, in one query. */
export const projectInclude = {
  links: { orderBy: { sortOrder: "asc" } },
  contacts: { include: { contact: true } },
  parent: { select: { id: true, name: true, slug: true, color: true } },
  children: {
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      color: true,
      station: true,
      lastActivityAt: true,
      _count: { select: { activities: true } },
    },
  },
  activities: { orderBy: { createdAt: "desc" }, take: 1 },
  _count: { select: { activities: true, children: true } },
} satisfies Prisma.AgentProjectInclude;

export type ProjectFull = Prisma.AgentProjectGetPayload<{
  include: typeof projectInclude;
}>;

export const contactInclude = {
  projects: {
    include: {
      project: { select: { id: true, name: true, slug: true, color: true } },
    },
  },
} satisfies Prisma.ContactInclude;

export type ContactFull = Prisma.ContactGetPayload<{
  include: typeof contactInclude;
}>;

/** A slug that isn't taken yet: "dehors", then "dehors-2", "dehors-3"… */
export async function uniqueSlug(name: string, ignoreId?: string) {
  const base = slugify(name) || "projet";
  let candidate = base;
  for (let i = 2; i < 100; i++) {
    const existing = await prisma.agentProject.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!existing || existing.id === ignoreId) return candidate;
    candidate = `${base}-${i}`;
  }
  return `${base}-${Date.now()}`;
}

/** True when `candidateParentId` is `projectId` itself or one of its descendants. */
export async function wouldCreateCycle(
  projectId: string,
  candidateParentId: string
): Promise<boolean> {
  let cursor: string | null = candidateParentId;
  for (let depth = 0; cursor && depth < 20; depth++) {
    if (cursor === projectId) return true;
    const row: { parentId: string | null } | null =
      await prisma.agentProject.findUnique({
        where: { id: cursor },
        select: { parentId: true },
      });
    cursor = row?.parentId ?? null;
  }
  return false;
}
