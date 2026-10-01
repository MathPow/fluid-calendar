import en from "./en.json";
import fr from "./fr.json";

import type { Locale } from "./config";

export type Catalog = Record<string, string>;

export const catalogs: Record<Locale, Catalog> = {
  fr: fr as Catalog,
  en: en as Catalog,
};

export function formatMessage(
  template: string,
  params?: Record<string, string | number>
): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    const value = params[key];
    return value === undefined || value === null ? match : String(value);
  });
}

export function translate(
  locale: Locale,
  key: string,
  params?: Record<string, string | number>
): string {
  const message = catalogs[locale]?.[key];
  if (typeof message !== "string") return key;
  return formatMessage(message, params);
}
