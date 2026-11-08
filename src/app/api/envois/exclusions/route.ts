import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { campaignErrorResponse } from "@/lib/envois/http";
import { AddExclusionInput } from "@/lib/envois/schemas";
import {
  addSuppression,
  listSuppressions,
  removeSuppression,
} from "@/lib/envois/service";

import { apiErrors } from "@/lib/api/errors";

const LOG_SOURCE = "envois-exclusions-api";

export const dynamic = "force-dynamic";

/** GET /api/envois/exclusions — addresses never to email again. */
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  try {
    return NextResponse.json(await listSuppressions(auth.userId));
  } catch (error) {
    return campaignErrorResponse(error, LOG_SOURCE);
  }
}

/** POST /api/envois/exclusions — add an address by hand. */
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const parsed = AddExclusionInput.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return apiErrors.invalidBody();
  }
  try {
    await addSuppression(auth.userId, parsed.data.email);
    return NextResponse.json(await listSuppressions(auth.userId), {
      status: 201,
    });
  } catch (error) {
    return campaignErrorResponse(error, LOG_SOURCE);
  }
}

/** DELETE /api/envois/exclusions?id= — take an address off the list. */
export async function DELETE(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  try {
    await removeSuppression(auth.userId, id);
    return NextResponse.json(await listSuppressions(auth.userId));
  } catch (error) {
    return campaignErrorResponse(error, LOG_SOURCE);
  }
}
