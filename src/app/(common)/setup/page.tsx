import { redirect } from "next/navigation";

import { SetupForm } from "@/components/setup/SetupForm";

import { getT } from "@/i18n/server";
import { checkSetupStatus } from "@/lib/setup-actions";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Setup DreamDash",
  description: "Set up your DreamDash admin account",
};

export default async function SetupPage() {
  const t = await getT();
  // Check if any users already exist
  const { needsSetup } = await checkSetupStatus();

  // If users already exist, redirect to home page
  if (!needsSetup) {
    redirect("/calendar");
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-secondary p-4">
      <div className="mb-8 text-center">
        <h1 className="mb-2 text-4xl font-bold">{t("setup.page.title")}</h1>
        <p className="text-muted-foreground">{t("setup.page.description")}</p>
      </div>

      <SetupForm />
    </div>
  );
}
