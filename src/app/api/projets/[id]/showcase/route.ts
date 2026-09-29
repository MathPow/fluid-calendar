import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "projets-showcase";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/projets/[id]/showcase — the project's generated HTML page.
 * The page is AI-written and runs its own scripts, so it is served in a CSP
 * sandbox without allow-same-origin: it gets an opaque origin and can't read
 * the DreamDash session or call the API, even when opened directly.
 */
export async function GET(request: NextRequest, { params }: Ctx) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const showcase = await prisma.projectShowcase.findUnique({
    where: { projectId: id },
  });
  if (!showcase)
    return NextResponse.json({ error: "Introuvable" }, { status: 404 });

  return new NextResponse(showcase.html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy":
        "sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox; frame-ancestors 'self'",
      "Cache-Control": "private, no-cache",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/** DELETE /api/projets/[id]/showcase */
export async function DELETE(request: NextRequest, { params }: Ctx) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const { id } = await params;
  await prisma.projectShowcase.deleteMany({ where: { projectId: id } });
  return NextResponse.json({ ok: true });
}
