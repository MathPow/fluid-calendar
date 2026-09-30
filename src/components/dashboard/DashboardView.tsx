"use client";

import { useState } from "react";

import { useSession } from "next-auth/react";

import { LayoutGrid, Loader2 } from "lucide-react";

import { BentoGrid } from "@/components/dashboard/BentoGrid";
import { useDashboardData } from "@/components/dashboard/widgets";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const greeting = () => {
  const h = new Date().getHours();
  if (h < 5) return "Still up";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
};

export function DashboardView() {
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
          {greeting()}
          {firstName ? `, ${firstName}` : ""}.
        </h1>
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <Badge className="px-4 py-2 text-[13px] capitalize">{longDate}</Badge>
          <Badge className="px-4 py-2 text-[13px]">
            {todayEvents.length === 0
              ? "No events today"
              : `${todayEvents.length} event${todayEvents.length > 1 ? "s" : ""} today`}
          </Badge>
          <Badge className="px-4 py-2 text-[13px]">
            {openTasks.length === 0
              ? "Inbox zero"
              : `${openTasks.length} open task${openTasks.length > 1 ? "s" : ""}`}
          </Badge>
          {!editing && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditing(true)}
              className="ml-auto"
            >
              <LayoutGrid className="h-4 w-4" />
              Personnaliser
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
