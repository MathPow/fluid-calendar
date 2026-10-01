"use client";

import { useState } from "react";

import { useSession } from "next-auth/react";

import { LayoutGrid, Loader2 } from "lucide-react";

import { BentoGrid } from "@/components/dashboard/BentoGrid";
import { useDashboardData } from "@/components/dashboard/widgets";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { useT } from "@/i18n/client";

const greetingKey = () => {
  const h = new Date().getHours();
  if (h < 5) return "dashboard.greeting.stillUp";
  if (h < 12) return "dashboard.greeting.morning";
  if (h < 18) return "dashboard.greeting.afternoon";
  return "dashboard.greeting.evening";
};

export function DashboardView() {
  const t = useT();
  const { data: session } = useSession();
  const data = useDashboardData();
  const [editing, setEditing] = useState(false);

  if (data.loading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  const { todayEvents, openTasks } = data;
  const firstName = session?.user?.name?.trim().split(/\s+/)[0];
  const longDate = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="page pb-16 pt-8 md:pt-12">
      {/* ------------------------------------------------------------ Hero */}
      <section>
        <h1 className="display text-[44px] sm:text-[64px] md:text-[80px] lg:text-[96px]">
          {t(greetingKey())}
          {firstName ? `, ${firstName}` : ""}.
        </h1>
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <Badge className="px-4 py-2 text-[13px] capitalize">{longDate}</Badge>
          <Badge className="px-4 py-2 text-[13px]">
            {todayEvents.length === 0
              ? t("dashboard.hero.noEventsToday")
              : t(
                  todayEvents.length > 1
                    ? "dashboard.hero.todayEventsPlural"
                    : "dashboard.hero.todayEvents",
                  { count: todayEvents.length }
                )}
          </Badge>
          <Badge className="px-4 py-2 text-[13px]">
            {openTasks.length === 0
              ? t("dashboard.hero.inboxZero")
              : t(
                  openTasks.length > 1
                    ? "dashboard.hero.openTasksPlural"
                    : "dashboard.hero.openTasks",
                  { count: openTasks.length }
                )}
          </Badge>
          {!editing && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditing(true)}
              className="ml-auto"
            >
              <LayoutGrid className="h-4 w-4" />
              {t("dashboard.hero.customize")}
            </Button>
          )}
        </div>
        <div className="filet mt-8" />
      </section>

      {/* ----------------------------------------------------------- Bento */}
      <BentoGrid
        data={data}
        editing={editing}
        onExit={() => setEditing(false)}
      />
    </div>
  );
}
