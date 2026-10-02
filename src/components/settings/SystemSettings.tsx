import { useEffect } from "react";

import AccessDeniedMessage from "@/components/auth/AccessDeniedMessage";
import AdminOnly from "@/components/auth/AdminOnly";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { clearResendInstance } from "@/lib/email/resend";
import { logger } from "@/lib/logger";

import { useT } from "@/i18n";

import { useSettingsStore } from "@/store/settings";

import { SettingRow, SettingsSection } from "./SettingsSection";

const LOG_SOURCE = "SystemSettings";

/**
 * System settings component
 * Allows admins to configure system-wide settings
 * Only accessible by admin users
 */
export function SystemSettings() {
  const t = useT();
  const { system, updateSystemSettings } = useSettingsStore();

  useEffect(() => {
    // Load settings from API
    fetch("/api/system-settings")
      .then((res) => res.json())
      .then((data) => {
        updateSystemSettings({
          googleClientId: data.googleClientId,
          googleClientSecret: data.googleClientSecret,
          outlookClientId: data.outlookClientId,
          outlookClientSecret: data.outlookClientSecret,
          outlookTenantId: data.outlookTenantId,
          logLevel: data.logLevel,
          disableHomepage: data.disableHomepage,
          resendApiKey: data.resendApiKey,
        });
      })
      .catch((error) => {
        logger.error(
          "Failed to load system settings",
          { error: error instanceof Error ? error.message : "Unknown error" },
          LOG_SOURCE
        );
      });
  }, [updateSystemSettings]);

  const handleUpdate = async (updates: Partial<typeof system>) => {
    try {
      const response = await fetch("/api/system-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      const data = await response.json();
      updateSystemSettings(data);

      // Clear Resend instance if the API key was updated
      if ("resendApiKey" in updates) {
        clearResendInstance();
      }
    } catch (error) {
      logger.error(
        "Failed to update system settings",
        { error: error instanceof Error ? error.message : "Unknown error" },
        LOG_SOURCE
      );
    }
  };

  return (
    <AdminOnly
      fallback={
        <AccessDeniedMessage message={t("settings.system.accessDenied")} />
      }
    >
      <SettingsSection
        title={t("settings.system.title")}
        description={t("settings.system.description")}
      >
        <SettingRow
          label={t("settings.system.google.label")}
          description={
            <div className="space-y-2">
              <div>
                {t("settings.system.google.description")}
              </div>
              <div>
                {t("settings.system.howTo")}
                <ol className="ml-4 mt-1 list-decimal space-y-1 text-muted-foreground">
                  <li>
                    {t("settings.system.goTo")}{" "}
                    <a
                      href="https://console.cloud.google.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      Google Cloud Console
                    </a>
                  </li>
                  <li>{t("settings.system.google.steps.project")}</li>
                  <li>{t("settings.system.google.steps.enableApi")}</li>
                  <li>{t("settings.system.google.steps.credentials")}</li>
                  <li>{t("settings.system.google.steps.createClient")}</li>
                  <li>
                    {t("settings.system.google.steps.redirect", {
                      uri: `${window.location.origin}/api/calendar/google`,
                    })}
                  </li>
                  <li>{t("settings.system.google.steps.copy")}</li>
                </ol>
              </div>
            </div>
          }
        >
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("settings.system.google.clientId")}</Label>
              <Input
                type="text"
                value={system.googleClientId || ""}
                onChange={(e) =>
                  handleUpdate({ googleClientId: e.target.value })
                }
                placeholder="your-client-id.apps.googleusercontent.com"
              />
            </div>

            <div className="space-y-2">
              <Label>{t("settings.system.google.clientSecret")}</Label>
              <Input
                type="password"
                value={system.googleClientSecret || ""}
                onChange={(e) =>
                  handleUpdate({ googleClientSecret: e.target.value })
                }
                placeholder={t("settings.system.clientSecretPlaceholder")}
              />
            </div>
          </div>
        </SettingRow>

        <SettingRow
          label={t("settings.system.outlook.label")}
          description={
            <div className="space-y-2">
              <div>
                {t("settings.system.outlook.description")}
              </div>
              <div>
                {t("settings.system.howTo")}
                <ol className="ml-4 mt-1 list-decimal space-y-1 text-muted-foreground">
                  <li>
                    {t("settings.system.goTo")}{" "}
                    <a
                      href="https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      Azure Portal
                    </a>
                  </li>
                  <li>{t("settings.system.outlook.steps.register")}</li>
                  <li>{t("settings.system.outlook.steps.permissions")}</li>
                  <li>{t("settings.system.outlook.steps.authentication")}</li>
                  <li>{t("settings.system.outlook.steps.platform")}</li>
                  <li>
                    {t("settings.system.outlook.steps.redirect", {
                      uri: `${window.location.origin}/api/calendar/outlook`,
                    })}
                  </li>
                  <li>{t("settings.system.outlook.steps.copy")}</li>
                </ol>
              </div>
            </div>
          }
        >
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("settings.system.outlook.clientId")}</Label>
              <Input
                type="text"
                value={system.outlookClientId || ""}
                onChange={(e) =>
                  handleUpdate({ outlookClientId: e.target.value })
                }
                placeholder="your-client-id"
              />
            </div>

            <div className="space-y-2">
              <Label>{t("settings.system.outlook.clientSecret")}</Label>
              <Input
                type="password"
                value={system.outlookClientSecret || ""}
                onChange={(e) =>
                  handleUpdate({ outlookClientSecret: e.target.value })
                }
                placeholder={t("settings.system.clientSecretPlaceholder")}
              />
            </div>

            <div className="space-y-2">
              <Label>{t("settings.system.outlook.tenantId")}</Label>
              <Input
                type="text"
                value={system.outlookTenantId || ""}
                onChange={(e) =>
                  handleUpdate({ outlookTenantId: e.target.value })
                }
                placeholder="common"
              />
              <p className="text-sm text-muted-foreground">
                {t("settings.system.outlook.tenantHint")}
              </p>
            </div>
          </div>
        </SettingRow>

        <SettingRow
          label={t("settings.system.homepage.label")}
          description={t("settings.system.homepage.description")}
        >
          <div className="space-y-2">
            <Label>{t("settings.system.homepage.disable")}</Label>
            <Select
              value={system.disableHomepage ? "true" : "false"}
              onValueChange={(value) =>
                handleUpdate({ disableHomepage: value === "true" })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="false">
                  {t("settings.system.homepage.show")}
                </SelectItem>
                <SelectItem value="true">
                  {t("settings.system.homepage.redirect")}
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              {t("settings.system.homepage.hint")}
            </p>
          </div>
        </SettingRow>

        <SettingRow
          label={t("settings.system.email.label")}
          description={t("settings.system.email.description")}
        >
          <div className="space-y-2">
            <Label>{t("settings.system.email.resendKey")}</Label>
            <Input
              type="password"
              value={system.resendApiKey || ""}
              onChange={(e) => handleUpdate({ resendApiKey: e.target.value })}
              placeholder={t("settings.system.email.resendKeyPlaceholder")}
            />
            <p className="text-sm text-muted-foreground">
              {t("settings.system.email.resendKeyHint")}
            </p>
          </div>
        </SettingRow>
      </SettingsSection>
    </AdminOnly>
  );
}
