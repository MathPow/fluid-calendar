import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "mail-contacts-route";

export const dynamic = "force-dynamic";

/**
 * GET /api/mail/contacts — contacts that have an email, for the To/Cc/Bcc
 * suggestions while composing. Favourites first.
 */
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const contacts = await prisma.contact.findMany({
    where: { email: { not: null } },
    select: {
      id: true,
      name: true,
      email: true,
      company: true,
      favorite: true,
    },
    orderBy: [{ favorite: "desc" }, { name: "asc" }],
  });
  return NextResponse.json({
    contacts: contacts.filter((c) => c.email?.trim()),
  });
}
