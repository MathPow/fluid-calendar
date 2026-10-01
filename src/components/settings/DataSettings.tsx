"use client";

import { useT } from "@/i18n/client";
import { useSettingsStore } from "@/store/settings";

import { SettingRow, SettingsSection } from "./SettingsSection";

export function DataSettings() {
  const t = useT();
  const { data, updateDataSettings } = useSettingsStore();

  return (
    <SettingsSection
      title={t("settings.data.title")}
      description={t("settings.data.description")}
    >
      <SettingRow
        label={t("settings.data.autoBackup.label")}
        description={t("settings.data.autoBackup.description")}
      >
        <div className="space-y-4">
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={data.autoBackup}
              onChange={(e) =>
                updateDataSettings({
                  autoBackup: e.target.checked,
                })
              }
              className="h-4 w-4 rounded border-border text-foreground focus:ring-ring"
            />
            <span className="ml-2 text-sm">
              {t("settings.data.autoBackup.enable")}
            </span>
          </label>

          {data.autoBackup && (
            <div>
              <label className="block text-sm font-medium text-foreground/80">
                {t("settings.data.autoBackup.intervalLabel")}
              </label>
              <input
                type="number"
                min="1"
                max="30"
                value={data.backupInterval}
                onChange={(e) =>
                  updateDataSettings({
                    backupInterval: Number(e.target.value),
                  })
                }
                className="mt-1 block w-full rounded-xl border-border shadow-sm focus:border-ring focus:ring-ring sm:text-sm"
              />
            </div>
          )}
        </div>
      </SettingRow>

      <SettingRow
        label={t("settings.data.retention.label")}
        description={t("settings.data.retention.description")}
      >
        <div>
          <label className="block text-sm font-medium text-foreground/80">
            {t("settings.data.retention.inputLabel")}
          </label>
          <input
            type="number"
            min="30"
            max="3650"
            value={data.retainDataFor}
            onChange={(e) =>
              updateDataSettings({
                retainDataFor: Number(e.target.value),
              })
            }
            className="mt-1 block w-full rounded-xl border-border shadow-sm focus:border-ring focus:ring-ring sm:text-sm"
          />
          <p className="mt-1 text-sm text-muted-foreground">
            {t("settings.data.retention.hint")}
          </p>
        </div>
      </SettingRow>

      <SettingRow
        label={t("settings.data.export.label")}
        description={t("settings.data.export.description")}
      >
        <div className="space-y-3">
          <button
            type="button"
            className="inline-flex items-center rounded-full border-[1.5px] border-foreground bg-transparent px-4 py-2 text-sm font-semibold text-foreground hover:bg-foreground hover:text-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          >
            {t("settings.data.export.ical")}
          </button>
          <button
            type="button"
            className="inline-flex items-center rounded-full border-[1.5px] border-foreground bg-transparent px-4 py-2 text-sm font-semibold text-foreground hover:bg-foreground hover:text-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          >
            {t("settings.data.export.json")}
          </button>
        </div>
      </SettingRow>

      <SettingRow
        label={t("settings.data.clear.label")}
        description={t("settings.data.clear.description")}
      >
        <button
          type="button"
          className="inline-flex items-center rounded-xl border border-transparent bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground hover:bg-destructive/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          onClick={() => {
            if (window.confirm(t("settings.data.clear.confirm"))) {
              // TODO: Implement clear data functionality
            }
          }}
        >
          {t("settings.data.clear.button")}
        </button>
      </SettingRow>
    </SettingsSection>
  );
}
