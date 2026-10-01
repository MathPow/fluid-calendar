import { useState } from "react";

import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useT } from "@/i18n/client";
import { useSettingsStore } from "@/store/settings";

import { SettingRow, SettingsSection } from "./SettingsSection";

export function NotificationSettings() {
  const t = useT();
  const { notifications, updateNotificationSettings } = useSettingsStore();
  const { state: pushState, loading: pushLoading, subscribe, unsubscribe } =
    usePushNotifications();
  const [testStatus, setTestStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function sendTestNotification() {
    setTestStatus("sending");
    try {
      const res = await fetch("/api/push/test", { method: "POST" });
      setTestStatus(res.ok ? "sent" : "error");
    } catch {
      setTestStatus("error");
    } finally {
      setTimeout(() => setTestStatus("idle"), 3000);
    }
  }

  const pushLabel: Record<typeof pushState, string> = {
    unsupported: t("notifSettings.push.unsupported"),
    denied: t("notifSettings.push.denied"),
    subscribed: t("notifSettings.push.disable"),
    unsubscribed: t("notifSettings.push.enable"),
  };

  return (
    <SettingsSection
      title={t("notifSettings.title")}
      description={t("notifSettings.description")}
    >
      <SettingRow
        label={t("notifSettings.email.title")}
        description={t("notifSettings.email.description")}
      >
        <div className="space-y-2">
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={notifications.dailyEmailEnabled}
              onChange={(e) =>
                updateNotificationSettings({
                  dailyEmailEnabled: e.target.checked,
                })
              }
              className="h-4 w-4 rounded border-border text-foreground focus:ring-ring"
            />
            <span className="ml-2 text-sm">
              {t("notifSettings.email.enable")}
            </span>
          </label>
        </div>
      </SettingRow>

      <SettingRow
        label={t("notifSettings.push.title")}
        description={t("notifSettings.push.description")}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={pushState === "subscribed" ? unsubscribe : subscribe}
            disabled={
              pushLoading ||
              pushState === "unsupported" ||
              pushState === "denied"
            }
            className="rounded-full bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pushLoading ? t("notifSettings.push.working") : pushLabel[pushState]}
          </button>
          {pushState === "subscribed" && (
            <>
              <span className="text-sm text-positive-foreground">
                {t("notifSettings.push.active")}
              </span>
              <button
                onClick={sendTestNotification}
                disabled={testStatus === "sending"}
                className="rounded-full border-[1.5px] border-foreground px-4 py-1.5 text-sm font-semibold disabled:opacity-50"
              >
                {testStatus === "sending"
                  ? t("notifSettings.push.sending")
                  : testStatus === "sent"
                    ? t("notifSettings.push.sent")
                    : testStatus === "error"
                      ? t("notifSettings.push.failed")
                      : t("notifSettings.push.sendTest")}
              </button>
            </>
          )}
        </div>
      </SettingRow>

      <SettingRow
        label={t("notifSettings.reminders.title")}
        description={t("notifSettings.reminders.description")}
      >
        <div className="flex flex-col gap-3">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={notifications.pushRemindersEnabled ?? true}
              onChange={(e) =>
                updateNotificationSettings({
                  pushRemindersEnabled: e.target.checked,
                })
              }
              className="h-4 w-4 rounded border-border text-foreground focus:ring-ring"
            />
            <span className="text-sm">
              {t("notifSettings.reminders.enable")}
            </span>
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={1440}
              value={notifications.pushReminderMinutes ?? 30}
              onChange={(e) =>
                updateNotificationSettings({
                  pushReminderMinutes: Math.max(1, parseInt(e.target.value) || 30),
                })
              }
              disabled={!(notifications.pushRemindersEnabled ?? true)}
              className="w-20 rounded-xl border border-border px-2 py-1 text-sm disabled:opacity-50"
            />
            <span className="text-sm text-muted-foreground">
              {t("notifSettings.reminders.minutesBefore")}
            </span>
          </div>
        </div>
      </SettingRow>
    </SettingsSection>
  );
}
