"use client";

import {
  PropsWithChildren,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
} from "react";

import { useSettingsStore } from "@/store/settings";

import { translate } from "./catalogs";
import { type Locale, defaultLocale, isLocale } from "./config";

export type TranslateFn = (
  key: string,
  params?: Record<string, string | number>
) => string;

interface LocaleContextValue {
  locale: Locale;
  t: TranslateFn;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

function writeLocaleCookie(locale: Locale) {
  if (typeof document === "undefined") return;
  document.cookie = `locale=${locale}; path=/; max-age=31536000; SameSite=Lax`;
}

export function LocaleProvider({ children }: PropsWithChildren) {
  const stored = useSettingsStore((s) => s.user.locale);
  const locale: Locale = isLocale(stored) ? stored : defaultLocale;

  const t = useCallback<TranslateFn>(
    (key, params) => translate(locale, key, params),
    [locale]
  );

  const value = useMemo<LocaleContextValue>(() => ({ locale, t }), [locale, t]);

  useEffect(() => {
    writeLocaleCookie(locale);
    if (typeof document !== "undefined") {
      document.documentElement.lang = locale;
    }
  }, [locale]);

  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

export function useLocale(): Locale {
  const ctx = useContext(LocaleContext);
  return ctx?.locale ?? defaultLocale;
}

export function useT(): TranslateFn {
  const ctx = useContext(LocaleContext);
  if (ctx) return ctx.t;
  return (key, params) => translate(defaultLocale, key, params);
}

/**
 * Pick the best user-facing message from an API error body. Prefers the
 * server-provided `errorKey` (translated here), then its `error` fallback,
 * then a local translated fallback.
 */
export function translateApiError(
  t: TranslateFn,
  data: { errorKey?: unknown; error?: unknown } | null | undefined,
  fallbackKey: string,
  fallbackParams?: Record<string, string | number>
): string {
  if (data && typeof data.errorKey === "string" && data.errorKey) {
    return t(data.errorKey);
  }
  if (data && typeof data.error === "string" && data.error) {
    return data.error;
  }
  return t(fallbackKey, fallbackParams);
}
