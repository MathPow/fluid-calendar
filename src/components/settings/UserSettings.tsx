import { useSession } from "next-auth/react";
import Image from "next/image";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { useT } from "@/i18n";

import { useSettingsStore } from "@/store/settings";

import { TimeFormat, WeekStartDay } from "@/types/settings";

import { SettingRow, SettingsSection } from "./SettingsSection";

export function UserSettings() {
  const t = useT();
  const { data: session } = useSession();
  const { user, updateUserSettings } = useSettingsStore();

  const timeFormats: { value: TimeFormat; label: string }[] = [
    { value: "12h", label: t("settings.user.timeFormat.12h") },
    { value: "24h", label: t("settings.user.timeFormat.24h") },
  ];

  const weekStarts: { value: WeekStartDay; label: string }[] = [
    { value: "sunday", label: t("common.weekday.sunday") },
    { value: "monday", label: t("common.weekday.monday") },
  ];

  // Comprehensive list of common timezones
  const timeZones = [
    // UTC
    "UTC",
    // North America
    "America/Anchorage",
    "America/Chicago",
    "America/Denver",
    "America/Edmonton",
    "America/Halifax",
    "America/Los_Angeles",
    "America/Mexico_City",
    "America/Montreal",
    "America/New_York",
    "America/Phoenix",
    "America/Toronto",
    "America/Vancouver",
    "America/Winnipeg",
    // South America
    "America/Bogota",
    "America/Buenos_Aires",
    "America/Caracas",
    "America/Lima",
    "America/Santiago",
    "America/Sao_Paulo",
    // Europe
    "Europe/Amsterdam",
    "Europe/Athens",
    "Europe/Berlin",
    "Europe/Brussels",
    "Europe/Budapest",
    "Europe/Copenhagen",
    "Europe/Dublin",
    "Europe/Helsinki",
    "Europe/Istanbul",
    "Europe/Lisbon",
    "Europe/London",
    "Europe/Madrid",
    "Europe/Moscow",
    "Europe/Oslo",
    "Europe/Paris",
    "Europe/Prague",
    "Europe/Rome",
    "Europe/Stockholm",
    "Europe/Vienna",
    "Europe/Warsaw",
    "Europe/Zurich",
    // Asia
    "Asia/Bangkok",
    "Asia/Dubai",
    "Asia/Hong_Kong",
    "Asia/Jakarta",
    "Asia/Jerusalem",
    "Asia/Karachi",
    "Asia/Kolkata",
    "Asia/Kuala_Lumpur",
    "Asia/Manila",
    "Asia/Riyadh",
    "Asia/Seoul",
    "Asia/Shanghai",
    "Asia/Singapore",
    "Asia/Taipei",
    "Asia/Tokyo",
    // Africa
    "Africa/Cairo",
    "Africa/Casablanca",
    "Africa/Johannesburg",
    "Africa/Lagos",
    "Africa/Nairobi",
    // Oceania
    "Australia/Adelaide",
    "Australia/Brisbane",
    "Australia/Darwin",
    "Australia/Melbourne",
    "Australia/Perth",
    "Australia/Sydney",
    "Pacific/Auckland",
    "Pacific/Fiji",
    "Pacific/Honolulu",
  ];

  return (
    <SettingsSection
      title={t("settings.user.title")}
      description={t("settings.user.description")}
    >
      {session?.user && (
        <SettingRow
          label={t("settings.user.profile.label")}
          description={t("settings.user.profile.description")}
        >
          <div className="flex items-center space-x-3">
            {session.user.image && (
              <Image
                src={session.user.image}
                alt={session.user.name || ""}
                width={40}
                height={40}
                className="rounded-full"
              />
            )}
            <div>
              <div className="font-medium">{session.user.name}</div>
              <div className="text-sm text-muted-foreground">
                {session.user.email}
              </div>
            </div>
          </div>
        </SettingRow>
      )}

      <SettingRow
        label={t("settings.user.timeFormat.label")}
        description={t("settings.user.timeFormat.description")}
      >
        <Select
          value={user.timeFormat}
          onValueChange={(value) =>
            updateUserSettings({ timeFormat: value as TimeFormat })
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {timeFormats.map((format) => (
              <SelectItem key={format.value} value={format.value}>
                {format.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SettingRow>

      <SettingRow
        label={t("settings.user.weekStart.label")}
        description={t("settings.user.weekStart.description")}
      >
        <Select
          value={user.weekStartDay}
          onValueChange={(value) =>
            updateUserSettings({ weekStartDay: value as WeekStartDay })
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {weekStarts.map((day) => (
              <SelectItem key={day.value} value={day.value}>
                {day.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SettingRow>

      <SettingRow
        label={t("settings.user.timeZone.label")}
        description={t("settings.user.timeZone.description")}
      >
        <Select
          value={user.timeZone}
          onValueChange={(value) => updateUserSettings({ timeZone: value })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-[300px]">
            {timeZones.map((zone) => (
              <SelectItem key={zone} value={zone}>
                {zone.replace(/_/g, " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SettingRow>
    </SettingsSection>
  );
}
