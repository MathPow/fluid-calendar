import { useSettingsStore } from "@/store/settings";

import { translate } from "./catalogs";
import { type Locale, defaultLocale, isLocale } from "./config";

/** Current UI locale, readable outside React (stores, plain modules). */
export function localeNow(): Locale {
  const stored = useSettingsStore.getState().user.locale;
  return isLocale(stored) ? stored : defaultLocale;
}

/** Translate with the current locale, for non-component code (no hooks). */
export function tNow(
  key: string,
  params?: Record<string, string | number>
): string {
  return translate(localeNow(), key, params);
}

/**
 * Best message for an API error response. Prefers a translated `errorKey`
 * (so EN users get an EN label), falls back to the server's `error` string,
 * then to a generic key. Safe to call with any `{}`.
 */
export function apiErrorMessage(
  body: unknown,
  fallbackKey = "api.common.saveFailed"
): string {
  const b = (body ?? {}) as { errorKey?: unknown; error?: unknown };
  if (typeof b.errorKey === "string") {
    const out = tNow(b.errorKey);
    if (out !== b.errorKey) return out;
  }
  if (typeof b.error === "string" && b.error) return b.error;
  return tNow(fallbackKey);
}
