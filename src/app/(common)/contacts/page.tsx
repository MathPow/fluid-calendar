import { ContactsBoard } from "@/components/projets/ContactsBoard";

import { prisma } from "@/lib/prisma";
import { contactInclude } from "@/lib/projets/queries";

export const dynamic = "force-dynamic";

export default async function ContactsPage() {
  const [contacts, projects] = await Promise.all([
    prisma.contact.findMany({ include: contactInclude, orderBy: { name: "asc" } }),
    prisma.agentProject.findMany({
      where: { archived: false },
      select: {
        id: true,
        name: true,
        slug: true,
        color: true,
        parentId: true,
        station: true,
      },
      orderBy: { name: "asc" },
    }),
  ]);

  return <ContactsBoard contacts={contacts} projects={projects} />;
}
