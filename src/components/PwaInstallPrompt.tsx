"use client";

import { useEffect } from "react";

export function PwaInstallPrompt() {
  useEffect(() => {
    import("@khmyznikov/pwa-install").catch(() => {});
  }, []);

  return (
    <pwa-install
      manifest-url="/manifest.json"
      name="FluidCalendar"
      description="Your self-hosted intelligent calendar"
      icon="/logo.svg"
    />
  );
}
