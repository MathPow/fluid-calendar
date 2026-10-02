"use client";

import { useState } from "react";
import { useRef } from "react";

import { Download, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

import { useT } from "@/i18n";

export function ImportExportSettings() {
  const t = useT();
  const [includeCompleted, setIncludeCompleted] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const response = await fetch(
        `/api/export/tasks?includeCompleted=${includeCompleted}`
      );

      if (!response.ok) {
        throw new Error("Failed to export tasks");
      }

      const data = await response.json();

      // Create a blob from the JSON data
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });

      // Create a download link and trigger the download
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `fluid-calendar-tasks-${
        new Date().toISOString().split("T")[0]
      }.json`;
      document.body.appendChild(link);
      link.click();

      // Clean up
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success(t("toasts.settings.importExport.exportSuccess"));
    } catch (error) {
      console.error("Export error:", error);
      toast.error(t("toasts.settings.importExport.exportError"));
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);

    try {
      // Read the file
      const reader = new FileReader();

      reader.onload = async (event) => {
        try {
          const content = event.target?.result as string;
          const data = JSON.parse(content);

          // Send the data to the import API
          const response = await fetch("/api/import/tasks", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(data),
          });

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || "Import failed");
          }

          const result = await response.json();
          toast.success(
            t("toasts.settings.importExport.importSuccess", {
              count: result.imported,
            })
          );
        } catch (error) {
          console.error("Import processing error:", error);
          toast.error(
            t("toasts.settings.importExport.importError", {
              error:
                error instanceof Error
                  ? error.message
                  : t("toasts.settings.importExport.unknownError"),
            })
          );
        } finally {
          setIsImporting(false);
          // Reset the file input
          if (fileInputRef.current) {
            fileInputRef.current.value = "";
          }
        }
      };

      reader.onerror = () => {
        toast.error(t("toasts.settings.importExport.readError"));
        setIsImporting(false);
      };

      reader.readAsText(file);
    } catch (error) {
      console.error("Import error:", error);
      toast.error(t("toasts.settings.importExport.importFailed"));
      setIsImporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.importExport.title")}</CardTitle>
          <CardDescription>
            {t("settings.importExport.description")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="includeCompleted"
                checked={includeCompleted}
                onCheckedChange={(checked) =>
                  setIncludeCompleted(checked as boolean)
                }
              />
              <Label htmlFor="includeCompleted">
                {t("settings.importExport.includeCompleted")}
              </Label>
            </div>

            <div className="flex flex-col gap-4 sm:flex-row">
              <Button
                onClick={handleExport}
                disabled={isExporting}
                className="flex items-center gap-2"
              >
                {isExporting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                {t("settings.importExport.export")}
              </Button>

              <Button
                onClick={handleImportClick}
                disabled={isImporting}
                variant="outline"
                className="flex items-center gap-2"
              >
                {isImporting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                {t("settings.importExport.import")}
              </Button>

              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".json"
                className="hidden"
              />
            </div>
          </div>

          <div className="space-y-2 text-sm text-muted-foreground">
            <p>
              <strong>{t("settings.importExport.help.exportLabel")}</strong>{" "}
              {t("settings.importExport.help.export")}
            </p>
            <p>
              <strong>{t("settings.importExport.help.importLabel")}</strong>{" "}
              {t("settings.importExport.help.import")}
            </p>
            <p className="text-pending-foreground">
              {t("settings.importExport.help.note")}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
