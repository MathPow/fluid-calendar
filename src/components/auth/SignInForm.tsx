"use client";

import { useState } from "react";
import { useEffect } from "react";

import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { useT } from "@/i18n/client";
import { isPublicSignupEnabledClient } from "@/lib/auth/client-public-signup";
import { logger } from "@/lib/logger";

const LOG_SOURCE = "SignInForm";

export function SignInForm() {
  const t = useT();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"signin" | "signup">("signin");
  const [publicSignupEnabled, setPublicSignupEnabled] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const checkPublicSignup = async () => {
      try {
        const isEnabled = await isPublicSignupEnabledClient();
        setPublicSignupEnabled(isEnabled);
      } catch (error) {
        logger.error(
          "Failed to check if public signup is enabled",
          { error: error instanceof Error ? error.message : "Unknown error" },
          LOG_SOURCE
        );
      }
    };

    checkPublicSignup();
  }, []);

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        toast.error(t("auth.signIn.toasts.authFailed"), {
          description: t("auth.signIn.toasts.authFailedDesc"),
        });
      } else {
        toast.success(t("auth.signIn.toasts.signedIn"));

        // The token is set in the background, so we'll redirect after a minimal delay
        // to ensure the token is available for the next request
        setTimeout(() => {
          // Force a hard navigation to ensure the middleware re-evaluates with the new token
          window.location.href = "/calendar";
        }, 100);
      }
    } catch (error) {
      logger.error(
        "Error signing in",
        { error: error instanceof Error ? error.message : "Unknown error" },
        LOG_SOURCE
      );
      toast.error(t("auth.signIn.toasts.errorOccurred"), {
        description: t("auth.signIn.toasts.tryLater"),
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          password,
          name,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        toast.error(t("auth.signIn.toasts.registerFailed"), {
          description: data.error || t("auth.signIn.toasts.tryLater"),
        });
      } else {
        toast.success(t("auth.signIn.toasts.accountCreated"), {
          description: t("auth.signIn.toasts.accountCreatedDesc"),
        });
        setActiveTab("signin");
      }
    } catch (error) {
      logger.error(
        "Error signing up",
        { error: error instanceof Error ? error.message : "Unknown error" },
        LOG_SOURCE
      );
      toast.error(t("auth.signIn.toasts.errorOccurred"), {
        description: t("auth.signIn.toasts.tryLater"),
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="mx-auto mt-10 w-full max-w-[400px] rounded-tile">
      <CardContent className="p-7 md:p-8">
        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as "signin" | "signup")}
        >
          {publicSignupEnabled && (
            <TabsList className="mb-6 grid w-full grid-cols-2">
              <TabsTrigger value="signin">{t("auth.signIn.tabs.signIn")}</TabsTrigger>
              <TabsTrigger value="signup">{t("auth.signIn.tabs.signUp")}</TabsTrigger>
            </TabsList>
          )}

          <TabsContent value="signin">
            <form onSubmit={handleEmailSignIn} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">{t("auth.signIn.labels.email")}</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder={t("auth.signIn.placeholders.email")}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">{t("auth.signIn.labels.password")}</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <Button
                type="submit"
                size="lg"
                className="w-full"
                disabled={isLoading}
              >
                {isLoading
                  ? t("auth.signIn.actions.signingIn")
                  : t("auth.signIn.actions.signIn")}
              </Button>
              <div className="text-center">
                <Button
                  variant="link"
                  className="text-[13px] text-muted-foreground"
                  onClick={() => router.push("/auth/reset-password")}
                  type="button"
                >
                  {t("auth.signIn.actions.forgotPassword")}
                </Button>
              </div>
            </form>
          </TabsContent>

          {publicSignupEnabled && (
            <TabsContent value="signup">
              <form onSubmit={handleSignUp} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signup-name">
                    {t("auth.signIn.labels.nameOptional")}
                  </Label>
                  <Input
                    id="signup-name"
                    type="text"
                    placeholder={t("auth.signIn.placeholders.name")}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-email">
                    {t("auth.signIn.labels.email")}
                  </Label>
                  <Input
                    id="signup-email"
                    type="email"
                    placeholder={t("auth.signIn.placeholders.email")}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-password">
                    {t("auth.signIn.labels.password")}
                  </Label>
                  <Input
                    id="signup-password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
                <Button
                  type="submit"
                  size="lg"
                  className="w-full"
                  disabled={isLoading}
                >
                  {isLoading
                    ? t("auth.signIn.actions.creatingAccount")
                    : t("auth.signIn.actions.createAccount")}
                </Button>
              </form>
            </TabsContent>
          )}
        </Tabs>
      </CardContent>
      <CardFooter className="justify-center px-7 pb-7 text-center text-[12px] leading-relaxed text-muted-foreground md:px-8 md:pb-8">
        {t("auth.signIn.footer")}
      </CardFooter>
    </Card>
  );
}
