"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { useT } from "@/i18n/client";
import { logger } from "@/lib/logger";

const LOG_SOURCE = "CalDAVAccountForm";

// Define types for test results
interface TestStep {
  step: string;
  status: "pending" | "success" | "failed";
  error?: string;
  calendars?: number;
  calendarNames?: string[];
}

interface TestResult {
  steps: TestStep[];
  success: boolean;
  error: string | null;
  details: string | null;
}

interface CalDAVAccountFormProps {
  onSuccess?: () => void;
  onCancel?: () => void;
}

/**
 * Form component for adding a new CalDAV account
 * Collects server URL, username, password, and optional path
 */
export function CalDAVAccountForm({
  onSuccess,
  onCancel,
}: CalDAVAccountFormProps) {
  const t = useT();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [formData, setFormData] = useState({
    serverUrl: "",
    username: "",
    password: "",
    path: "", // Optional path for some CalDAV servers
  });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<TestResult | null>(null);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));

    // Clear error when user makes changes
    if (errorMessage) {
      setErrorMessage(null);
    }

    // Clear test results when form changes
    if (testResults) {
      setTestResults(null);
    }
  };

  const handleTest = async () => {
    // Validate form
    if (!formData.serverUrl || !formData.username || !formData.password) {
      setErrorMessage(t("settings.caldav.errors.missingFields"));
      return;
    }

    try {
      setIsTesting(true);
      setErrorMessage(null);
      setTestResults(null);

      // Ensure the server URL has the correct format
      let serverUrl = formData.serverUrl;
      if (
        !serverUrl.startsWith("http://") &&
        !serverUrl.startsWith("https://")
      ) {
        serverUrl = `https://${serverUrl}`;
      }

      // Remove trailing slash if present
      if (serverUrl.endsWith("/")) {
        serverUrl = serverUrl.slice(0, -1);
      }

      const response = await fetch("/api/calendar/caldav/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          serverUrl,
          username: formData.username,
          password: formData.password,
          path: formData.path || undefined,
        }),
      });

      const data = await response.json();
      setTestResults(data as TestResult);

      if (!response.ok || !data.success) {
        throw new Error(data.error || t("settings.caldav.errors.connectFailed"));
      }

      logger.info(
        "CalDAV test connection successful",
        { serverUrl, username: formData.username },
        LOG_SOURCE
      );
    } catch (error) {
      logger.error(
        "CalDAV test connection failed",
        {
          error: error instanceof Error ? error.message : "Unknown error",
        },
        LOG_SOURCE
      );
      setErrorMessage(
        error instanceof Error
          ? error.message
          : t("settings.caldav.errors.connectFailed")
      );
    } finally {
      setIsTesting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    // Validate form
    if (!formData.serverUrl || !formData.username || !formData.password) {
      setErrorMessage(t("settings.caldav.errors.missingFields"));
      return;
    }

    try {
      setIsSubmitting(true);

      // Ensure the server URL has the correct format
      let serverUrl = formData.serverUrl;
      if (
        !serverUrl.startsWith("http://") &&
        !serverUrl.startsWith("https://")
      ) {
        serverUrl = `https://${serverUrl}`;
      }

      // Remove trailing slash if present
      if (serverUrl.endsWith("/")) {
        serverUrl = serverUrl.slice(0, -1);
      }

      const response = await fetch("/api/calendar/caldav/auth", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          serverUrl,
          username: formData.username,
          password: formData.password,
          path: formData.path || undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.error || t("settings.caldav.errors.connectFailed")
        );
      }

      await response.json();

      alert(
        t("settings.caldav.successAlert", { username: formData.username })
      );

      if (onSuccess) {
        onSuccess();
      }
    } catch (error) {
      logger.error(
        "Failed to connect CalDAV account",
        {
          error: error instanceof Error ? error.message : "Unknown error",
        },
        LOG_SOURCE
      );
      setErrorMessage(
        error instanceof Error
          ? error.message
          : t("settings.caldav.errors.connectFailed")
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // Render test results
  const renderTestResults = () => {
    if (!testResults) return null;

    return (
      <div className="mt-4 rounded-xl border bg-secondary p-4 ">
        <h3 className="mb-2 font-medium">
          {t("settings.caldav.testResults.title")}
        </h3>

        {testResults.steps &&
          testResults.steps.map((step, index) => (
            <div key={index} className="mb-2">
              <div className="flex items-center">
                <span
                  className={`mr-2 ${
                    step.status === "success"
                      ? "text-positive-foreground"
                      : step.status === "failed"
                        ? "text-negative-foreground"
                        : "text-pending-foreground"
                  }`}
                >
                  {step.status === "success"
                    ? "✓"
                    : step.status === "failed"
                      ? "✗"
                      : "⟳"}
                </span>
                <span className="font-medium">{step.step}</span>
                {step.status === "success" && step.calendars !== undefined && (
                  <span className="ml-2 text-sm text-muted-foreground">
                    {t("settings.caldav.testResults.calendarsFound", {
                      count: step.calendars,
                    })}
                  </span>
                )}
              </div>

              {step.error && (
                <div className="ml-6 mt-1 whitespace-pre-wrap text-sm text-negative-foreground">
                  {t("settings.caldav.testResults.errorLabel")}: {step.error}
                </div>
              )}

              {step.calendarNames && step.calendarNames.length > 0 && (
                <div className="ml-6 mt-1 text-sm text-muted-foreground">
                  {t("settings.caldav.testResults.calendarsLabel")}:{" "}
                  {step.calendarNames.join(", ")}
                </div>
              )}
            </div>
          ))}

        {testResults.error && !testResults.steps?.some((s) => s.error) && (
          <div className="mt-2 text-negative-foreground">
            <div className="font-medium">
              {t("settings.caldav.testResults.errorLabel")}:
            </div>
            <div className="whitespace-pre-wrap text-sm">
              {testResults.error}
            </div>
          </div>
        )}

        {testResults.success && (
          <div className="mt-2 font-medium text-positive-foreground">
            {t("settings.caldav.testResults.success")}
          </div>
        )}
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.caldav.title")}</CardTitle>
        <CardDescription>{t("settings.caldav.description")}</CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          {errorMessage && (
            <div className="mb-3 rounded-2xl bg-negative p-3 text-sm text-negative-foreground">
              {errorMessage}
            </div>
          )}

          <fieldset className="mb-4">
            <Label
              className="mb-2.5 text-[15px] leading-normal"
              htmlFor="serverUrl"
            >
              {t("settings.caldav.serverUrl.label")}{" "}
              <span className="text-negative-foreground">*</span>
            </Label>
            <Input
              id="serverUrl"
              name="serverUrl"
              placeholder="https://caldav.example.com"
              value={formData.serverUrl}
              onChange={handleChange}
              required
            />
            <p className="mt-1 text-sm text-muted-foreground">
              {t("settings.caldav.serverUrl.hint")}
            </p>
          </fieldset>

          <fieldset className="mb-4">
            <Label
              className="mb-2.5 text-[15px] leading-normal"
              htmlFor="username"
            >
              {t("settings.caldav.username.label")}{" "}
              <span className="text-negative-foreground">*</span>
            </Label>
            <Input
              id="username"
              name="username"
              placeholder="your.email@example.com"
              value={formData.username}
              onChange={handleChange}
              required
            />
            <p className="mt-1 text-sm text-muted-foreground">
              {t("settings.caldav.username.hint")}
            </p>
          </fieldset>

          <fieldset className="mb-4">
            <Label
              className="mb-2.5 text-[15px] leading-normal"
              htmlFor="password"
            >
              {t("settings.caldav.password.label")}{" "}
              <span className="text-negative-foreground">*</span>
            </Label>
            <Input
              id="password"
              name="password"
              type="password"
              placeholder="••••••••"
              value={formData.password}
              onChange={handleChange}
              required
            />
            <p className="mt-1 text-sm text-muted-foreground">
              {t("settings.caldav.password.hint")}
            </p>
          </fieldset>

          <fieldset className="mb-4">
            <Label className="mb-2.5 text-[15px] leading-normal" htmlFor="path">
              {t("settings.caldav.path.label")}
            </Label>
            <Input
              id="path"
              name="path"
              placeholder="/dav/calendars/user/username@fastmail.com"
              value={formData.path}
              onChange={handleChange}
            />
            <p className="mt-1 text-sm text-muted-foreground">
              {t("settings.caldav.path.hint")}
            </p>
          </fieldset>

          <div className="mt-4">
            <Button
              type="button"
              variant="outline"
              onClick={handleTest}
              disabled={isTesting || isSubmitting}
              className="w-full"
            >
              {isTesting
                ? t("settings.caldav.testing")
                : t("settings.caldav.testConnection")}
            </Button>
          </div>

          {renderTestResults()}
        </CardContent>

        <CardFooter className="flex justify-between">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isSubmitting || isTesting}
          >
            {t("common.cancel")}
          </Button>
          <Button type="submit" disabled={isSubmitting || isTesting}>
            {isSubmitting
              ? t("settings.caldav.connecting")
              : t("settings.caldav.connect")}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
