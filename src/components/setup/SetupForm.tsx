"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";

import { CircleAlert, CircleCheck } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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

import { useT } from "@/i18n";

import { useSetupStore } from "@/store/setup";

export function SetupForm() {
  const t = useT();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const { setSetupStatus } = useSetupStore();

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    // Basic validation
    if (!formData.name || !formData.email || !formData.password) {
      setError(t("setup.errors.allRequired"));
      setIsLoading(false);
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError(t("setup.errors.passwordMismatch"));
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch("/api/setup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          password: formData.password,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || t("setup.errors.setupFailed"));
      }

      setSuccess(true);

      // Update the setup store to indicate setup is complete
      setSetupStatus(false);

      // Redirect to home page after a short delay
      setTimeout(() => {
        router.push("/calendar");
        router.refresh();
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("setup.errors.unknown"));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="mx-auto w-full max-w-md">
      <CardHeader>
        <CardTitle className="text-2xl">{t("setup.title")}</CardTitle>
        <CardDescription>{t("setup.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        {error && (
          <Alert variant="destructive" className="mb-4">
            <CircleAlert className="h-4 w-4" />
            <AlertTitle>{t("setup.errorAlert")}</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {success && (
          <Alert className="mb-4 bg-positive">
            <CircleCheck className="h-4 w-4 text-positive-foreground" />
            <AlertTitle className="text-positive-foreground">
              {t("setup.success.title")}
            </AlertTitle>
            <AlertDescription className="text-positive-foreground">
              {t("setup.success.description")}
            </AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSubmit}>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="name">{t("setup.fields.name")}</Label>
              <Input
                id="name"
                name="name"
                placeholder={t("setup.placeholders.name")}
                value={formData.name}
                onChange={handleChange}
                disabled={isLoading || success}
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="email">{t("setup.fields.email")}</Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="admin@example.com"
                value={formData.email}
                onChange={handleChange}
                disabled={isLoading || success}
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="password">{t("setup.fields.password")}</Label>
              <Input
                id="password"
                name="password"
                type="password"
                value={formData.password}
                onChange={handleChange}
                disabled={isLoading || success}
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="confirmPassword">
                {t("setup.fields.confirmPassword")}
              </Label>
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                value={formData.confirmPassword}
                onChange={handleChange}
                disabled={isLoading || success}
                required
              />
            </div>
          </div>

          <Button
            type="submit"
            className="mt-6 w-full"
            disabled={isLoading || success}
          >
            {isLoading ? t("setup.submitting") : t("setup.submit")}
          </Button>
        </form>
      </CardContent>
      <CardFooter className="flex justify-center text-sm text-muted-foreground">
        {t("setup.footer")}
      </CardFooter>
    </Card>
  );
}
