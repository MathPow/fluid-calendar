"use client";

import { useT } from "@/i18n";

import AccessDeniedMessage from "@/components/auth/AccessDeniedMessage";
import AdminOnly from "@/components/auth/AdminOnly";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import PublicSignupSettings from "./PublicSignupSettings";
import { SettingsSection } from "./SettingsSection";

/**
 * User management settings component
 * Allows admins to manage user accounts and public signup settings
 */
export function UserManagement() {
  const t = useT();
  return (
    <AdminOnly
      fallback={
        <AccessDeniedMessage message={t("settings.users.accessDenied")} />
      }
    >
      <SettingsSection
        title={t("settings.users.title")}
        description={t("settings.users.description")}
      >
        <div className="space-y-6">
          <PublicSignupSettings />

          <Card>
            <CardHeader>
              <CardTitle>{t("settings.users.accounts.title")}</CardTitle>
              <CardDescription>
                {t("settings.users.accounts.description")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                {t("settings.users.accounts.comingSoon")}
              </p>
            </CardContent>
          </Card>
        </div>
      </SettingsSection>
    </AdminOnly>
  );
}
