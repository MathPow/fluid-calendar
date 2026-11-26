import { NextResponse } from "next/server";

import { getT } from "@/i18n/server";

/**
 * Localized JSON error for an API route. Reads the user's locale from the
 * cookie, translates `key`, and still exposes `errorKey` so clients that want
 * to translate themselves can skip the server string.
 */
export async function jsonError(
  key: string,
  status: number,
  params?: Record<string, string | number>,
  extra?: Record<string, unknown>
): Promise<NextResponse> {
  const t = await getT();
  return NextResponse.json(
    { error: t(key, params), errorKey: key, ...(extra ?? {}) },
    { status }
  );
}
