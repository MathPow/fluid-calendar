import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/prisma";
import { contactTagSelect } from "@/lib/projets/queries";
import { ContactTagInput } from "@/lib/projets/schemas";

const LOG_SOURCE = "contact-tags-api";

export const dynamic = "force-dynamic";

/** GET /api/contact-tags — every official contact tag, with how many use it. */
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const tags = await prisma.contactTag.findMany({
    select: { ...contactTagSelect, _count: { select: { contacts: true } } },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(
    tags.map(({ _count, ...t }) => ({ ...t, count: _count.contacts }))
  );
}

/** POST /api/contact-tags — a new tag; an existing name returns that tag. */
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const parsed = ContactTagInput.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalide" },
      { status: 400 }
    );
  }
  const { name, color } = parsed.data;
  // Same tag whatever the case: « tristan leads » finds « Tristan leads ».
  const existing = await prisma.contactTag.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
    select: contactTagSelect,
  });
  if (existing) return NextResponse.json({ ...existing, count: 0 });
  const tag = await prisma.contactTag.create({
    data: { name, color: color ?? null },
    select: contactTagSelect,
  });
  return NextResponse.json({ ...tag, count: 0 }, { status: 201 });
}
