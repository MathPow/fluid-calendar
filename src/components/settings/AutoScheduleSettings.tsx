"use client";

import { useEffect } from "react";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";

import { useT } from "@/i18n/client";
import {
  formatTime,
  parseSelectedCalendars,
  parseWorkDays,
  stringifySelectedCalendars,
  stringifyWorkDays,
} from "@/lib/autoSchedule";

import { useCalendarStore } from "@/store/calendar";
import { useSettingsStore } from "@/store/settings";

import { SettingRow, SettingsSection } from "./SettingsSection";

export function AutoScheduleSettings() {
  const t = useT();
  const { autoSchedule, updateAutoScheduleSettings } = useSettingsStore();
  const { feeds, loadFromDatabase } = useCalendarStore();

  // Load calendar feeds when component mounts
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

  const timeOptions = Array.from({ length: 24 }, (_, i) => ({
    value: i,
    label: formatTime(i),
  }));

  const selectedCalendars = parseSelectedCalendars(
    autoSchedule.selectedCalendars
  );
  const workDays = parseWorkDays(autoSchedule.workDays);

  const notSet = t("settings.autoSchedule.notSet");

  return (
    <SettingsSection
      title={t("settings.autoSchedule.title")}
      description={t("settings.autoSchedule.description")}
    >
      <SettingRow
        label={t("settings.autoSchedule.calendars.label")}
        description={t("settings.autoSchedule.calendars.description")}
      >
        <div className="space-y-2">
          {feeds.map((feed) => (
            <div key={feed.id} className="flex items-center space-x-2">
              <Switch
                checked={selectedCalendars.includes(feed.id)}
                onCheckedChange={(checked) => {
                  const calendars = checked
                    ? [...selectedCalendars, feed.id]
                    : selectedCalendars.filter((id) => id !== feed.id);
                  updateAutoScheduleSettings({
                    selectedCalendars: stringifySelectedCalendars(calendars),
                  });
                }}
              />
              <Label className="flex items-center gap-2">
                <span
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: feed.color || "var(--muted)" }}
                />
                {feed.name}
              </Label>
            </div>
          ))}
          {feeds.length === 0 && (
            <div className="text-sm text-muted-foreground">
              {t("settings.autoSchedule.calendars.empty")}
            </div>
          )}
        </div>
      </SettingRow>

      <SettingRow
        label={t("settings.autoSchedule.workingHours.label")}
        description={t("settings.autoSchedule.workingHours.description")}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>{t("settings.autoSchedule.workingHours.startTime")}</Label>
              <Select
                value={autoSchedule.workHourStart.toString()}
                onValueChange={(value) =>
                  updateAutoScheduleSettings({
                    workHourStart: parseInt(value),
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {timeOptions.map((time) => (
                    <SelectItem key={time.value} value={time.value.toString()}>
                      {time.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("settings.autoSchedule.workingHours.endTime")}</Label>
              <Select
                value={autoSchedule.workHourEnd.toString()}
                onValueChange={(value) =>
                  updateAutoScheduleSettings({
                    workHourEnd: parseInt(value),
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {timeOptions.map((time) => (
                    <SelectItem key={time.value} value={time.value.toString()}>
                      {time.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>{t("settings.autoSchedule.workingHours.workingDays")}</Label>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {workingDays.map((day) => (
                <div key={day.value} className="flex items-center space-x-2">
                  <Switch
                    checked={workDays.includes(day.value)}
                    onCheckedChange={(checked) => {
                      const days = checked
                        ? [...workDays, day.value]
                        : workDays.filter((d) => d !== day.value);
                      updateAutoScheduleSettings({
                        workDays: stringifyWorkDays(days),
                      });
                    }}
                  />
                  <Label className="text-sm">{t(day.labelKey)}</Label>
                </div>
              ))}
            </div>
          </div>
        </div>
      </SettingRow>

      <SettingRow
        label={t("settings.autoSchedule.energy.label")}
        description={t("settings.autoSchedule.energy.description")}
      >
        <div className="space-y-6">
          <div className="space-y-2">
            <Label>{t("settings.autoSchedule.energy.high")}</Label>
            <div className="grid grid-cols-2 gap-4">
              <Select
                value={autoSchedule.highEnergyStart?.toString() || "none"}
                onValueChange={(value) =>
                  updateAutoScheduleSettings({
                    highEnergyStart: value === "none" ? null : parseInt(value),
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder={notSet} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{notSet}</SelectItem>
                  {timeOptions.map((time) => (
                    <SelectItem key={time.value} value={time.value.toString()}>
                      {time.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={autoSchedule.highEnergyEnd?.toString() || "none"}
                onValueChange={(value) =>
                  updateAutoScheduleSettings({
                    highEnergyEnd: value === "none" ? null : parseInt(value),
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder={notSet} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{notSet}</SelectItem>
                  {timeOptions.map((time) => (
                    <SelectItem key={time.value} value={time.value.toString()}>
                      {time.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t("settings.autoSchedule.energy.medium")}</Label>
            <div className="grid grid-cols-2 gap-4">
              <Select
                value={autoSchedule.mediumEnergyStart?.toString() || "none"}
                onValueChange={(value) =>
                  updateAutoScheduleSettings({
                    mediumEnergyStart:
                      value === "none" ? null : parseInt(value),
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder={notSet} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{notSet}</SelectItem>
                  {timeOptions.map((time) => (
                    <SelectItem key={time.value} value={time.value.toString()}>
                      {time.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={autoSchedule.mediumEnergyEnd?.toString() || "none"}
                onValueChange={(value) =>
                  updateAutoScheduleSettings({
                    mediumEnergyEnd: value === "none" ? null : parseInt(value),
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder={notSet} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{notSet}</SelectItem>
                  {timeOptions.map((time) => (
                    <SelectItem key={time.value} value={time.value.toString()}>
                      {time.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t("settings.autoSchedule.energy.low")}</Label>
            <div className="grid grid-cols-2 gap-4">
              <Select
                value={autoSchedule.lowEnergyStart?.toString() || "none"}
                onValueChange={(value) =>
                  updateAutoScheduleSettings({
                    lowEnergyStart: value === "none" ? null : parseInt(value),
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder={notSet} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{notSet}</SelectItem>
                  {timeOptions.map((time) => (
                    <SelectItem key={time.value} value={time.value.toString()}>
                      {time.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={autoSchedule.lowEnergyEnd?.toString() || "none"}
                onValueChange={(value) =>
                  updateAutoScheduleSettings({
                    lowEnergyEnd: value === "none" ? null : parseInt(value),
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder={notSet} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{notSet}</SelectItem>
                  {timeOptions.map((time) => (
                    <SelectItem key={time.value} value={time.value.toString()}>
                      {time.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </SettingRow>

      <SettingRow
        label={t("settings.autoSchedule.buffer.label")}
        description={t("settings.autoSchedule.buffer.description")}
      >
        <div className="space-y-4">
          <Slider
            value={[autoSchedule.bufferMinutes]}
            onValueChange={([value]) =>
              updateAutoScheduleSettings({ bufferMinutes: value })
            }
            min={0}
            max={60}
            step={5}
          />
          <div className="text-sm text-muted-foreground">
            {t("settings.autoSchedule.buffer.current", {
              minutes: autoSchedule.bufferMinutes,
            })}
          </div>
        </div>
      </SettingRow>

      <SettingRow
        label={t("settings.autoSchedule.groupByProject.label")}
        description={t("settings.autoSchedule.groupByProject.description")}
      >
        <Switch
          checked={autoSchedule.groupByProject}
          onCheckedChange={(checked) =>
            updateAutoScheduleSettings({ groupByProject: checked })
          }
        />
      </SettingRow>
    </SettingsSection>
  );
}
