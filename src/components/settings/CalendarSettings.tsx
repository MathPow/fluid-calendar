"use client";

import { useEffect } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { useT } from "@/i18n/client";
import { useCalendarStore } from "@/store/calendar";
import { useSettingsStore } from "@/store/settings";

import { SettingRow, SettingsSection } from "./SettingsSection";

export function CalendarSettings() {
  const t = useT();
  const { calendar, updateCalendarSettings, user, updateUserSettings } =
    useSettingsStore();
  const { feeds, loadFromDatabase } = useCalendarStore();

  // Load feeds when component mounts
  useEffect(() => {
    loadFromDatabase();
  }, [loadFromDatabase]);

  const workingDays = [
    { value: 0, labelKey: "common.weekday.sunday" },
    { value: 1, labelKey: "common.weekday.monday" },
    { value: 2, labelKey: "common.weekday.tuesday" },
    { value: 3, labelKey: "common.weekday.wednesday" },
    { value: 4, labelKey: "common.weekday.thursday" },
    { value: 5, labelKey: "common.weekday.friday" },
    { value: 6, labelKey: "common.weekday.saturday" },
  ];

  return (
    <SettingsSection
      title={t("settings.calendar.title")}
      description={t("settings.calendar.description")}
    >
      <SettingRow
        label={t("settings.calendar.defaultCalendar.label")}
        description={t("settings.calendar.defaultCalendar.description")}
      >
        <Select
          value={calendar.defaultCalendarId || "none"}
          onValueChange={(value) =>
            updateCalendarSettings({
              defaultCalendarId: value === "none" ? "" : value,
            })
          }
        >
          <SelectTrigger>
            <SelectValue
              placeholder={t("settings.calendar.defaultCalendar.placeholder")}
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">
              {t("settings.calendar.defaultCalendar.placeholder")}
            </SelectItem>
            {feeds
              .filter((feed) => feed.enabled)
              .map((feed) => (
                <SelectItem key={feed.id} value={feed.id}>
                  {feed.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </SettingRow>

      <SettingRow
        label={t("settings.calendar.weekStart.label")}
        description={t("settings.calendar.weekStart.description")}
      >
        <Select
          value={user.weekStartDay}
          onValueChange={(value) =>
            updateUserSettings({
              weekStartDay: value as "monday" | "sunday",
            })
          }
        >
          <SelectTrigger>
            <SelectValue
              placeholder={t("settings.calendar.weekStart.placeholder")}
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="sunday">{t("common.weekday.sunday")}</SelectItem>
            <SelectItem value="monday">{t("common.weekday.monday")}</SelectItem>
          </SelectContent>
        </Select>
      </SettingRow>

      <SettingRow
        label={t("settings.calendar.workingHours.label")}
        description={t("settings.calendar.workingHours.description")}
      >
        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="show-working-hours"
              checked={calendar.workingHours.enabled}
              onCheckedChange={(checked) =>
                updateCalendarSettings({
                  workingHours: {
                    ...calendar.workingHours,
                    enabled: checked as boolean,
                  },
                })
              }
            />
            <Label htmlFor="show-working-hours">
              {t("settings.calendar.workingHours.show")}
            </Label>
          </div>

          <div className="flex space-x-4">
            <div className="flex-1">
              <Label>{t("settings.calendar.workingHours.startTime")}</Label>
              <Input
                type="time"
                value={calendar.workingHours.start}
                onChange={(e) =>
                  updateCalendarSettings({
                    workingHours: {
                      ...calendar.workingHours,
                      start: e.target.value,
                    },
                  })
                }
              />
            </div>
            <div className="flex-1">
              <Label>{t("settings.calendar.workingHours.endTime")}</Label>
              <Input
                type="time"
                value={calendar.workingHours.end}
                onChange={(e) =>
                  updateCalendarSettings({
                    workingHours: {
                      ...calendar.workingHours,
                      end: e.target.value,
                    },
                  })
                }
              />
            </div>
          </div>

          <div>
            <Label>{t("settings.calendar.workingHours.workingDays")}</Label>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {workingDays.map((day) => (
                <div key={day.value} className="flex items-center space-x-2">
                  <Checkbox
                    id={`day-${day.value}`}
                    checked={calendar.workingHours.days.includes(day.value)}
                    onCheckedChange={(checked) => {
                      const days = checked
                        ? [...calendar.workingHours.days, day.value]
                        : calendar.workingHours.days.filter(
                            (d) => d !== day.value
                          );
                      updateCalendarSettings({
                        workingHours: {
                          ...calendar.workingHours,
                          days,
                        },
                      });
                    }}
                  />
                  <Label htmlFor={`day-${day.value}`} className="text-sm">
                    {t(day.labelKey)}
                  </Label>
                </div>
              ))}
            </div>
          </div>
        </div>
      </SettingRow>
    </SettingsSection>
  );
}
