import { useEffect, useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { logger } from "@/lib/logger";
import { LogSettings as LogSettingsType } from "@/lib/logger/types";

import { useT } from "@/i18n";

const LOG_SOURCE = "LogSettings";

export function LogSettings() {
  const t = useT();
  const [settings, setSettings] = useState<LogSettingsType>({
    logLevel: "none",
    logDestination: "db",
    logRetention: {
      error: 30,
      warn: 14,
      info: 7,
      debug: 3,
    },
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  logger.info("LogSettings component mounted", undefined, LOG_SOURCE);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch("/api/logs/settings");
      if (!response.ok) throw new Error("Failed to fetch settings");
      const data = await response.json();
      setSettings(data);
      logger.debug(
        "Log settings fetched successfully",
        {
          settings: JSON.stringify(data),
        },
        LOG_SOURCE
      );
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to fetch settings";
      logger.error(
        "Failed to fetch log settings",
        {
          error: errorMessage,
        },
        LOG_SOURCE
      );
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setLoading(true);
      setError(null);
      setSaved(false);

      const response = await fetch("/api/logs/settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(settings),
      });

      if (!response.ok) throw new Error("Failed to update settings");

      logger.info(
        "Log settings updated successfully",
        {
          settings: JSON.stringify(settings),
        },
        LOG_SOURCE
      );
      setSaved(true);
      setTimeout(() => setSaved(false), 3000); // Clear saved message after 3 seconds
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to update settings";
      logger.error(
        "Failed to update log settings",
        {
          error: errorMessage,
          settings: JSON.stringify(settings),
        },
        LOG_SOURCE
      );
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card className="flex min-h-[400px] items-center justify-center">
        <LoadingSpinner size="lg" />
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.logs.settings.title")}</CardTitle>
        <CardDescription>
          {t("settings.logs.settings.description")}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {saved && (
          <Alert>
            <AlertDescription>
              {t("settings.logs.settings.saved")}
            </AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="logLevel">{t("settings.logs.level")}</Label>
            <Select
              value={settings.logLevel}
              onValueChange={(value) =>
                setSettings({
                  ...settings,
                  logLevel: value as LogSettingsType["logLevel"],
                })
              }
            >
              <SelectTrigger id="logLevel">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("common.none")}</SelectItem>
                <SelectItem value="error">
                  {t("settings.logs.levels.error")}
                </SelectItem>
                <SelectItem value="warn">
                  {t("settings.logs.levels.warn")}
                </SelectItem>
                <SelectItem value="info">
                  {t("settings.logs.levels.info")}
                </SelectItem>
                <SelectItem value="debug">
                  {t("settings.logs.levels.debug")}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="logDestination">
              {t("settings.logs.settings.destination")}
            </Label>
            <Select
              value={settings.logDestination}
              onValueChange={(value) =>
                setSettings({
                  ...settings,
                  logDestination: value as LogSettingsType["logDestination"],
                })
              }
            >
              <SelectTrigger id="logDestination">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="db">
                  {t("settings.logs.settings.destinations.db")}
                </SelectItem>
                <SelectItem value="file">
                  {t("settings.logs.settings.destinations.file")}
                </SelectItem>
                <SelectItem value="both">
                  {t("settings.logs.settings.destinations.both")}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-4">
          <Label className="text-base">
            {t("settings.logs.settings.retention")}
          </Label>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Object.entries(settings.logRetention).map(([level, days]) => (
              <div key={level} className="space-y-2">
                <Label htmlFor={`retention-${level}`} className="capitalize">
                  {t(`settings.logs.levels.${level}`)}
                </Label>
                <Input
                  type="number"
                  id={`retention-${level}`}
                  value={days}
                  min={1}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      logRetention: {
                        ...settings.logRetention,
                        [level]: parseInt(e.target.value) || 1,
                      },
                    })
                  }
                />
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end pt-4">
          <Button onClick={handleSave} disabled={loading}>
            {loading ? t("common.saving") : t("settings.logs.settings.save")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
