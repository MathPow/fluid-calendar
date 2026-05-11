import { useState } from "react";

import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useSettingsStore } from "@/store/settings";

import { SettingRow, SettingsSection } from "./SettingsSection";

export function NotificationSettings() {
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
    unsupported: "Not supported in this browser",
    denied: "Blocked — enable in browser settings",
    subscribed: "Disable push notifications",
    unsubscribed: "Enable push notifications",
  };

  return (
    <SettingsSection
      title="Notification Settings"
      description="Configure your notification preferences."
    >
      <SettingRow
        label="Daily Email Updates"
        description="Receive a daily email with your upcoming meetings and tasks"
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
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="ml-2 text-sm">Enable daily email updates</span>
          </label>
        </div>
      </SettingRow>

      <SettingRow
        label="Push Notifications"
        description="Receive push notifications on this device (works on iPhone when installed as a PWA)"
      >
        <div className="flex items-center gap-3">
          <button
            onClick={pushState === "subscribed" ? unsubscribe : subscribe}
            disabled={
              pushLoading ||
              pushState === "unsupported" ||
              pushState === "denied"
            }
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pushLoading ? "Working…" : pushLabel[pushState]}
          </button>
          {pushState === "subscribed" && (
            <>
              <span className="text-sm text-green-600">Active</span>
              <button
                onClick={sendTestNotification}
                disabled={testStatus === "sending"}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm disabled:opacity-50"
              >
                {testStatus === "sending" ? "Sending…" : testStatus === "sent" ? "Sent!" : testStatus === "error" ? "Failed" : "Send test"}
              </button>
            </>
          )}
        </div>
      </SettingRow>

      <SettingRow
        label="Event reminders"
        description="Send a push notification before calendar events start"
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
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm">Enable event reminders</span>
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
              className="w-20 rounded-md border border-gray-300 px-2 py-1 text-sm disabled:opacity-50"
            />
            <span className="text-sm text-muted-foreground">minutes before</span>
          </div>
        </div>
      </SettingRow>
    </SettingsSection>
  );
}
