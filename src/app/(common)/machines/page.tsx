import { MachinesBoard } from "@/components/machines/MachinesBoard";

import { prisma } from "@/lib/prisma";
import { machineSelect } from "@/lib/projets/queries";

export const dynamic = "force-dynamic";

export default async function MachinesPage() {
  const machines = await prisma.machine.findMany({
    orderBy: [{ kind: "asc" }, { name: "asc" }],
    select: {
      ...machineSelect,
      locations: {
        orderBy: { lastSeenAt: "desc" },
        select: {
          id: true,
          path: true,
          project: {
            select: { id: true, slug: true, name: true, color: true },
          },
        },
      },
    },
  });
  return <MachinesBoard machines={machines} />;
}
