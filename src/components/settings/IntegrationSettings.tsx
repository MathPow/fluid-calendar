import { useSession } from "next-auth/react";

import { useT } from "@/i18n";
import { Chrome } from "lucide-react";

import { useSettingsStore } from "@/store/settings";

import { SettingRow, SettingsSection } from "./SettingsSection";

export function IntegrationSettings() {
  const t = useT();
  const { data: session } = useSession();
  const { integrations, updateIntegrationSettings } = useSettingsStore();

  return (
    <SettingsSection
      title={t("settings.integrations.title")}
      description={t("settings.integrations.description")}
    >
      <SettingRow
        label="Google Calendar"
        description={t("settings.integrations.google.description")}
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Chrome className="h-6 w-6 text-muted-foreground" />
              <div>
                <div className="font-medium">Google Calendar</div>
                <div className="text-sm text-muted-foreground">
                  {session?.user?.email ||
                    t("settings.integrations.notConnected")}
                </div>
              </div>
            </div>
            <label className="relative inline-flex cursor-pointer items-center">
              <input
                type="checkbox"
                checked={integrations.googleCalendar.enabled}
                onChange={(e) =>
                  updateIntegrationSettings({
                    googleCalendar: {
                      ...integrations.googleCalendar,
                      enabled: e.target.checked,
                    },
                  })
                }
                className="peer sr-only"
              />
              <div className="peer h-6 w-11 rounded-full bg-border after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-border after:bg-card after:transition-all after:content-[''] peer-checked:bg-primary peer-checked:after:translate-x-full peer-checked:after:border-card peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-ring"></div>
            </label>
          </div>

          {integrations.googleCalendar.enabled && (
            <>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={integrations.googleCalendar.autoSync}
                  onChange={(e) =>
                    updateIntegrationSettings({
                      googleCalendar: {
                        ...integrations.googleCalendar,
                        autoSync: e.target.checked,
                      },
                    })
                  }
                  className="h-4 w-4 rounded border-border text-foreground focus:ring-ring"
                />
                <span className="ml-2 text-sm">
                  {t("settings.integrations.autoSync")}
                </span>
              </label>

              <div>
                <label className="block text-sm font-medium text-foreground/80">
                  {t("settings.integrations.syncInterval")}
                </label>
                <input
                  type="number"
                  min="1"
                  max="60"
                  value={integrations.googleCalendar.syncInterval}
                  onChange={(e) =>
                    updateIntegrationSettings({
                      googleCalendar: {
                        ...integrations.googleCalendar,
                        syncInterval: Number(e.target.value),
                      },
                    })
                  }
                  className="mt-1 block w-full rounded-xl border-border shadow-sm focus:border-ring focus:ring-ring sm:text-sm"
                />
              </div>
            </>
          )}
        </div>
      </SettingRow>
    </SettingsSection>
  );
}
