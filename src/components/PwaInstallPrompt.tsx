"use client";

import { useEffect } from "react";

export function PwaInstallPrompt() {
  useEffect(() => {
    import("@khmyznikov/pwa-install").catch(() => {});
  }, []);

  return (
    <pwa-install
      manifest-url="/manifest.json"
      name="DreamDash"
      description="Your personal command center — calendar, tasks, email and notes"
      icon="/logo.svg"
    />
  );
}
