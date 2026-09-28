import { ProjetsBoard } from "@/components/projets/ProjetsBoard";

import { prisma } from "@/lib/prisma";
import { projectInclude } from "@/lib/projets/queries";

// Activity is written by the bridge at any time; always render fresh.
export const dynamic = "force-dynamic";

export default async function ProjetsPage() {
  const [projects, contacts] = await Promise.all([
    prisma.agentProject.findMany({
      where: { archived: false },
      include: projectInclude,
      orderBy: [{ lastActivityAt: "desc" }, { name: "asc" }],
    }),
    prisma.contact.findMany({
      select: { id: true, name: true, company: true, role: true, email: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return <ProjetsBoard projects={projects} contacts={contacts} />;
}
