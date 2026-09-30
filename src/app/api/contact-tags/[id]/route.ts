import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/prisma";
import { contactTagSelect } from "@/lib/projets/queries";
import { ContactTagInput } from "@/lib/projets/schemas";

const LOG_SOURCE = "contact-tag-api";

type Ctx = { params: Promise<{ id: string }> };

/** PATCH /api/contact-tags/[id] — rename or recolour a tag. */
export async function PATCH(request: NextRequest, { params }: Ctx) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const parsed = ContactTagInput.partial().safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalide" },
      { status: 400 }
    );
  }
  const { name, color } = parsed.data;
  if (name) {
    const clash = await prisma.contactTag.findFirst({
      where: { name: { equals: name, mode: "insensitive" }, id: { not: id } },
      select: { id: true },
    });
    if (clash)
      return NextResponse.json(
        { error: "Un tag porte déjà ce nom." },
        { status: 409 }
      );
  }
  const tag = await prisma.contactTag
    .update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(color !== undefined ? { color } : {}),
      },
      select: contactTagSelect,
    })
    .catch(() => null);
  if (!tag) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  return NextResponse.json(tag);
}

/** DELETE /api/contact-tags/[id] — the tag goes; the contacts stay. */
export async function DELETE(request: NextRequest, { params }: Ctx) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const { count } = await prisma.contactTag.deleteMany({ where: { id } });
  if (!count)
    return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  return new NextResponse(null, { status: 204 });
}
