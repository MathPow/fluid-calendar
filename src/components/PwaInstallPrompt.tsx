"use client";

import { useEffect } from "react";

import { useT } from "@/i18n/client";

export function PwaInstallPrompt() {
  const t = useT();
  useEffect(() => {
    import("@khmyznikov/pwa-install").catch(() => {});
  }, []);

  return (
    <pwa-install
      manifest-url="/manifest.json"
      name="DreamDash"
      description={t("pwa.installDescription")}
      icon="/logo.svg"
    />
  );
}
