import { cookies } from "next/headers";

import { translate } from "./catalogs";
import { type Locale, defaultLocale, isLocale } from "./config";

export async function getLocale(): Promise<Locale> {
  const store = await cookies();
  const value = store.get("locale")?.value;
  return isLocale(value) ? value : defaultLocale;
}

export async function getT(): Promise<
  (key: string, params?: Record<string, string | number>) => string
> {
  const locale = await getLocale();
  return (key, params) => translate(locale, key, params);
}
