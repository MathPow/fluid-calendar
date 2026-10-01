"use client";

import { useEffect, useMemo, useState } from "react";
import { Suspense } from "react";

import dynamic from "next/dynamic";

import { AccountManager } from "@/components/settings/AccountManager";
import { AppearanceSettings } from "@/components/settings/AppearanceSettings";
import { AutoScheduleSettings } from "@/components/settings/AutoScheduleSettings";
import { CalendarSettings } from "@/components/settings/CalendarSettings";
import { ImportExportSettings } from "@/components/settings/ImportExportSettings";
import { LogViewer } from "@/components/settings/LogViewer";
import { NotificationSettings } from "@/components/settings/NotificationSettings";
import { StationSettings } from "@/components/settings/StationSettings";
import { SystemSettings } from "@/components/settings/SystemSettings";
import { TaskSyncSettings } from "@/components/settings/TaskSyncSettings";
import { UserManagement } from "@/components/settings/UserManagement";
import { UserSettings } from "@/components/settings/UserSettings";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

import { isSaasEnabled } from "@/lib/config";
import { cn } from "@/lib/utils";

import { useT } from "@/i18n/client";

import { useAdmin } from "@/hooks/use-admin";

import { useSettingsStore } from "@/store/settings";

// Add dynamic import for the waitlist page
const WaitlistPage = dynamic(
  () =>
    import(
      `./waitlist/page${
        process.env.NEXT_PUBLIC_ENABLE_SAAS_FEATURES === "true"
          ? ".saas"
          : ".open"
      }`
    ),
  {
    loading: () => <p>Loading...</p>,
  }
);

type SettingsTab =
  | "appearance"
  | "accounts"
  | "stations"
  | "user"
  | "calendar"
  | "auto-schedule"
  | "system"
  | "task-sync"
  | "logs"
  | "user-management"
  | "waitlist"
  | "import-export"
  | "admin-dashboard"
  | "notifications";

export default function SettingsPage() {
  const t = useT();
  const [isHydrated, setIsHydrated] = useState(false);
  const { isAdmin, isLoading: isAdminLoading } = useAdmin();
  const { initializeSettings } = useSettingsStore();

  // Always initialize settings on mount
  useEffect(() => {
    initializeSettings();
  }, [initializeSettings]);

  const tabs = useMemo(() => {
    const baseTabs = [
      { id: "appearance", label: t("settings.tabs.appearance") },
      { id: "accounts", label: t("settings.tabs.accounts") },
      { id: "stations", label: t("settings.tabs.stations") },
      { id: "user", label: t("settings.tabs.user") },
      { id: "calendar", label: t("settings.tabs.calendar") },
      { id: "auto-schedule", label: t("settings.tabs.autoSchedule") },
      { id: "task-sync", label: t("settings.tabs.taskSync") },
      { id: "notifications", label: t("settings.tabs.notifications") },
      { id: "import-export", label: t("settings.tabs.importExport") },
    ] as const;

    // Add admin-only tabs
    if (isAdmin) {
      const adminTabs = [
        { id: "system", label: t("settings.tabs.system") },
        { id: "logs", label: t("settings.tabs.logs") },
        { id: "user-management", label: t("settings.tabs.userManagement") },
      ] as const;

      // Only add the waitlist tab if SAAS features are enabled
      if (isSaasEnabled) {
        return [
          ...baseTabs,
          ...adminTabs,
          { id: "waitlist", label: t("settings.tabs.waitlist") },
          { id: "admin-dashboard", label: t("settings.tabs.adminDashboard") },
        ] as const;
      }

      return [...baseTabs, ...adminTabs] as const;
    }

    return baseTabs;
  }, [isAdmin, t]);

  const [activeTab, setActiveTab] = useState<SettingsTab>("appearance");

  // Check initial hash and handle changes
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.slice(1) as SettingsTab;

      // Check if the hash is a valid tab ID, regardless of admin status
      const allPossibleTabIds: SettingsTab[] = [
        "appearance",
        "accounts",
        "stations",
        "user",
        "calendar",
        "auto-schedule",
        "task-sync",
        "system",
        "logs",
        "user-management",
        "waitlist",
        "import-export",
        "admin-dashboard",
        "notifications",
      ];

      if (allPossibleTabIds.includes(hash)) {
        setActiveTab(hash);
      }
    };

    // Handle initial hash
    handleHashChange();

    // Listen for hash changes
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []); // Remove tabs dependency since we're now checking against all possible tabs

  // Set hydrated state after mount
  useEffect(() => {
    setIsHydrated(true);
  }, []);

  // Update hash when tab changes
  useEffect(() => {
    if (isHydrated) {
      window.location.hash = activeTab;
    }
  }, [activeTab, isHydrated]);

  const renderContent = () => {
    // Admin-only tabs
    const adminOnlyTabs = [
      "system",
      "logs",
      "user-management",
      "waitlist",
      "admin-dashboard",
    ];

    // If admin status is still loading and the active tab is admin-only, show loading state
    if (adminOnlyTabs.includes(activeTab) && isAdminLoading) {
      return (
        <div className="flex flex-col items-center justify-center p-8 text-center">
          <p className="text-muted-foreground">{t("settings.admin.checking")}</p>
        </div>
      );
    }

    // Check if the active tab is admin-only and the user is not an admin
    if (adminOnlyTabs.includes(activeTab) && !isAdmin) {
      return (
        <div className="flex flex-col items-center justify-center p-8 text-center">
          <h2 className="mb-4 text-2xl font-bold">
            {t("settings.admin.required.title")}
          </h2>
          <p className="text-muted-foreground">
            {t("settings.admin.required.description")}
          </p>
        </div>
      );
    }

    switch (activeTab) {
      case "appearance":
        return <AppearanceSettings />;
      case "accounts":
        return <AccountManager />;
      case "stations":
        return <StationSettings />;
      case "user":
        return <UserSettings />;
      case "calendar":
        return <CalendarSettings />;
      case "auto-schedule":
        return <AutoScheduleSettings />;
      case "task-sync":
        return <TaskSyncSettings />;
      case "notifications":
        return <NotificationSettings />;
      case "system":
        return <SystemSettings />;
      case "logs":
        return <LogViewer />;
      case "user-management":
        return <UserManagement />;
      case "import-export":
        return <ImportExportSettings />;
      case "waitlist":
        return (
          <Suspense fallback={<div>{t("settings.loading")}</div>}>
            <WaitlistPage />
          </Suspense>
        );
      case "admin-dashboard":
        return (
          <div className="flex flex-col items-center justify-center p-8 text-center">
            <h2 className="mb-4 text-2xl font-bold">
              {t("settings.adminDashboard.title")}
            </h2>
            <p className="mb-4 text-muted-foreground">
              {t("settings.adminDashboard.description")}
            </p>
            <Button asChild>
              <a href="/admin">{t("settings.adminDashboard.cta")}</a>
            </Button>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="page pb-16 pt-8 md:pt-12">
      <header>
        <h1 className="display text-[44px] sm:text-[56px] md:text-[72px]">
          {t("settings.title")}
        </h1>
        <div className="filet mt-8" />
      </header>

      <div className="mt-8 flex flex-col gap-5 lg:flex-row lg:items-start">
        <aside className="lg:sticky lg:top-4 lg:w-[280px] lg:shrink-0">
          <Card className="p-5 md:p-7">
            <p className="etiquette mb-3">{t("settings.sections")}</p>
            <nav className="-mx-1 flex gap-1 overflow-x-auto lg:mx-0 lg:flex-col lg:overflow-visible">
              {tabs.map((tab, i) => {
                const active = activeTab === tab.id;
                return (
                  <a
                    key={tab.id}
                    href={`#${tab.id}`}
                    onClick={(e) => {
                      e.preventDefault();
                      setActiveTab(tab.id as SettingsTab);
                    }}
                    className={cn(
                      "flex shrink-0 items-baseline gap-3 rounded-chip px-3 py-2.5 text-[15px] transition-colors",
                      !isHydrated && "duration-0",
                      active
                        ? "bg-tint-soft font-semibold tracking-title text-foreground"
                        : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                    )}
                  >
                    <span className="hidden text-[13px] font-semibold tabular-nums text-muted-foreground/70 lg:inline">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    {tab.label}
                  </a>
                );
              })}
            </nav>
          </Card>
        </aside>
        <div className="min-w-0 flex-1">
          <div className={cn("space-y-8", !isHydrated && "opacity-0")}>
            {renderContent()}
          </div>
        </div>
      </div>
    </div>
  );
}
