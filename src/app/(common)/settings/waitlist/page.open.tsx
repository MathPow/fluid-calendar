"use client";

import { useT } from "@/i18n";

/**
 * Open source version of the Waitlist Admin page
 * This shows a message that the feature is only available in the SAAS version
 */
export default function WaitlistPage() {
  const t = useT();
  return (
    <div className="rounded-lg bg-muted p-6">
      <h2 className="mb-4 text-2xl font-bold">
        {t("settings.waitlist.title")}
      </h2>
      <div className="mb-6 rounded-2xl bg-pending p-4">
        <div className="flex">
          <div className="flex-shrink-0">
            <svg
              className="h-5 w-5 text-pending-foreground"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <div className="ml-3">
            <p className="text-sm text-pending-foreground">
              <strong>{t("settings.waitlist.saasOnly.label")}</strong>{" "}
              {t("settings.waitlist.saasOnly.body")}
            </p>
          </div>
        </div>
      </div>
      <p className="mb-4 text-foreground/80">
        {t("settings.waitlist.features.intro")}
      </p>
      <ul className="mb-6 list-disc space-y-2 pl-5 text-foreground/80">
        <li>{t("settings.waitlist.features.manage")}</li>
        <li>{t("settings.waitlist.features.invite")}</li>
        <li>{t("settings.waitlist.features.referrals")}</li>
        <li>{t("settings.waitlist.features.configure")}</li>
      </ul>
      <p className="text-foreground/80">{t("settings.waitlist.upgrade")}</p>
    </div>
  );
}
