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
