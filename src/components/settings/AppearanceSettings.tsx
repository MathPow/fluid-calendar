"use client";

import { Monitor, Moon, Sun } from "lucide-react";

import { useTheme } from "@/components/providers/ThemeProvider";
import {
  SettingRow,
  SettingsSection,
} from "@/components/settings/SettingsSection";

import { cn } from "@/lib/utils";

import { useT } from "@/i18n/client";

import { useSettingsStore } from "@/store/settings";

import type { ThemeMode, UserLocale } from "@/types/settings";

const LOCALE_OPTIONS: { id: UserLocale; labelKey: string }[] = [
  { id: "fr", labelKey: "settings.appearance.language.fr" },
  { id: "en", labelKey: "settings.appearance.language.en" },
];

const THEME_OPTIONS: {
  id: ThemeMode;
  labelKey: string;
  icon: typeof Sun;
}[] = [
  { id: "light", labelKey: "settings.appearance.theme.light", icon: Sun },
  { id: "dark", labelKey: "settings.appearance.theme.dark", icon: Moon },
  { id: "system", labelKey: "settings.appearance.theme.system", icon: Monitor },
];

export function AppearanceSettings() {
  const t = useT();
  const { theme, setTheme } = useTheme();
  const locale = useSettingsStore((s) => s.user.locale ?? "fr");
  const updateUserSettings = useSettingsStore((s) => s.updateUserSettings);

  return (
    <SettingsSection
      title={t("common.appearance")}
      description={t("settings.description")}
    >
      <SettingRow
        label={t("settings.appearance.language.title")}
        description={t("settings.appearance.language.description")}
      >
        <div className="flex flex-wrap gap-2">
          {LOCALE_OPTIONS.map(({ id, labelKey }) => {
            const active = locale === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => updateUserSettings({ locale: id })}
                aria-pressed={active}
                className={cn(
                  "h-10 min-w-[6.5rem] rounded-full px-4 text-[14px] font-medium transition-colors",
                  active
                    ? "bg-foreground text-background"
                    : "bg-secondary text-foreground hover:bg-border/70"
                )}
              >
                {t(labelKey)}
              </button>
            );
          })}
        </div>
      </SettingRow>

      <SettingRow
        label={t("settings.appearance.theme.title")}
        description={t("settings.appearance.theme.description")}
      >
        <div
          role="radiogroup"
          aria-label={t("common.theme")}
          className="segmented w-max p-1"
        >
          {THEME_OPTIONS.map(({ id, labelKey, icon: Icon }) => {
            const active = theme === id;
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setTheme(id)}
                data-active={active}
                className="segmented-item h-9 px-3 text-[13px]"
              >
                <Icon className="h-4 w-4" />
                <span>{t(labelKey)}</span>
              </button>
            );
          })}
        </div>
      </SettingRow>
    </SettingsSection>
  );
}
