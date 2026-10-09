"use client";

import { useRouter } from "next/navigation";

import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";

import { useT } from "@/i18n";

export default function AdminAccessDenied() {
  const t = useT();
  const router = useRouter();

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center p-4">
      <div className="mb-4 rounded-full bg-destructive/10 p-4">
        <AlertTriangle className="h-12 w-12 text-destructive" />
      </div>
      <h1 className="mb-2 text-2xl font-bold">{t("admin.denied.title")}</h1>
      <p className="mb-6 max-w-md text-center text-muted-foreground">
        {t("admin.denied.description")}
      </p>
      <Button onClick={() => router.push("/")}>
        {t("error.returnHome")}
      </Button>
    </div>
  );
}
