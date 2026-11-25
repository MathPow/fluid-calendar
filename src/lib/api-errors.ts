import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { translate } from "@/i18n/catalogs";
import { defaultLocale, isLocale } from "@/i18n/config";

async function currentLocale() {
  const store = await cookies();
  const value = store.get("locale")?.value;
  return isLocale(value) ? value : defaultLocale;
}

/**
 * JSON error response with both a translated `error` message (the user's locale,
 * for backward-compatible clients that just read `data.error`) and an
 * `errorKey` that locale-aware clients can translate themselves. Extra fields
 * from `extra` are merged into the body (e.g. a `run` object).
 */
export async function jsonError(
  key: string,
  status: number,
  params?: Record<string, string | number>,
  extra?: Record<string, unknown>
) {
  const locale = await currentLocale();
  const message = translate(locale, key, params);
  return NextResponse.json({ error: message, errorKey: key, ...extra }, { status });
}
