"use client";

import { useEffect, useState } from "react";

import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

import { useT } from "@/i18n";

export default function PublicSignupSettings() {
  const t = useT();
  const [publicSignup, setPublicSignup] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const response = await fetch("/api/system-settings");
        if (response.ok) {
          const data = await response.json();
          setPublicSignup(data.publicSignup || false);
        }
      } catch (error) {
        console.error("Failed to fetch system settings:", error);
        toast.error(t("toasts.settings.loadError"));
      } finally {
        setIsLoading(false);
      }
    };

    fetchSettings();
  }, [t]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const response = await fetch("/api/system-settings", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          publicSignup,
        }),
      });

      if (response.ok) {
        toast.success(t("toasts.settings.saved"));
      } else {
        toast.error(t("toasts.settings.saveError"));
      }
    } catch (error) {
      console.error("Failed to save system settings:", error);
      toast.error(t("toasts.settings.saveError"));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.publicSignup.title")}</CardTitle>
        <CardDescription>
          {t("settings.publicSignup.description")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center space-x-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>{t("settings.publicSignup.loading")}</span>
          </div>
        ) : (
          <div className="flex items-center space-x-2">
            <Switch
              id="public-signup"
              checked={publicSignup}
              onCheckedChange={setPublicSignup}
            />
            <Label htmlFor="public-signup">
              {publicSignup
                ? t("settings.publicSignup.enabled")
                : t("settings.publicSignup.disabled")}
            </Label>
          </div>
        )}
      </CardContent>
      <CardFooter>
        <Button onClick={handleSave} disabled={isLoading || isSaving}>
          {isSaving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {t("common.saving")}
            </>
          ) : (
            t("settings.publicSignup.saveChanges")
          )}
        </Button>
      </CardFooter>
    </Card>
  );
}
