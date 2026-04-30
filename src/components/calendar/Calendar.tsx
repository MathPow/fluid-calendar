"use client";

import { useEffect } from "react";

import dynamic from "next/dynamic";
import { HiMenu } from "react-icons/hi";
import { IoChevronBack, IoChevronForward } from "react-icons/io5";

import { DayView } from "@/components/calendar/DayView";
import { FeedManager } from "@/components/calendar/FeedManager";
import { MonthView } from "@/components/calendar/MonthView";
import { MultiMonthView } from "@/components/calendar/MultiMonthView";
import { WeekView } from "@/components/calendar/WeekView";
import { SponsorshipBanner } from "@/components/ui/sponsorship-banner";

import { addDays, formatDate, newDate, subDays } from "@/lib/date-utils";
import { isSaasEnabled } from "@/lib/config";
import { cn } from "@/lib/utils";

import {
  useCalendarStore,
  useCalendarUIStore,
  useViewStore,
} from "@/store/calendar";
import { useTaskStore } from "@/store/task";

import { CalendarEvent, CalendarFeed } from "@/types/calendar";

const LifetimeAccessBanner = dynamic(
  () => import(`./LifetimeAccessBanner.${isSaasEnabled ? "saas" : "open"}`).then(
    (mod) => mod.LifetimeAccessBanner
  ),
  { ssr: false }
);

interface CalendarProps {
  initialFeeds?: CalendarFeed[];
  initialEvents?: CalendarEvent[];
}

export function Calendar({
  initialFeeds = [],
  initialEvents = [],
}: CalendarProps) {
  const { date: currentDate, setDate, view, setView } = useViewStore();
  const { isSidebarOpen, setSidebarOpen, isHydrated } = useCalendarUIStore();
  const { scheduleAllTasks } = useTaskStore();
  const { setFeeds, setEvents } = useCalendarStore();

  useEffect(() => {
    if (initialFeeds.length > 0) {
      setFeeds(initialFeeds);
    }

    if (initialEvents.length > 0) {
      setEvents(initialEvents);
    }

    if (!initialFeeds.length || !initialEvents.length) {
      useCalendarStore.getState().loadFromDatabase();
    }

    useTaskStore.getState().fetchTasks();
  }, [initialFeeds, initialEvents, setFeeds, setEvents]);

  // Default to day view on mobile
  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      setView("day");
    }
  }, [setView]);

  const handlePrevWeek = () => {
    if (view === "month" || view === "multiMonth") {
      const newDate = new Date(currentDate);
      newDate.setMonth(newDate.getMonth() - 1);
      setDate(newDate);
    } else {
      const days = view === "day" ? 1 : 7;
      setDate(subDays(currentDate, days));
    }
  };

  const handleNextWeek = () => {
    if (view === "month" || view === "multiMonth") {
      const newDate = new Date(currentDate);
      newDate.setMonth(newDate.getMonth() + 1);
      setDate(newDate);
    } else {
      const days = view === "day" ? 1 : 7;
      setDate(addDays(currentDate, days));
    }
  };

  const handleAutoSchedule = async () => {
    await scheduleAllTasks();
  };

  const viewButtons = [
    { key: "day", label: "Day" },
    { key: "week", label: "Week" },
    { key: "month", label: "Month" },
    { key: "multiMonth", label: "Year" },
  ] as const;

  return (
    <div className="flex h-full w-full overflow-hidden">
      {/* Mobile backdrop */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "h-full w-80 flex-none border-r border-gray-200 bg-white",
          "transform transition-transform duration-300 ease-in-out",
          // Mobile: fixed overlay
          "fixed inset-y-0 left-0 z-40",
          // Desktop: relative in flex flow
          "md:relative md:z-auto",
          !isHydrated && "opacity-0 duration-0",
          isSidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
        style={{ marginLeft: isSidebarOpen ? 0 : "-20rem" }}
      >
        <div className="flex h-full flex-col">
          <div className="flex-1 overflow-y-auto">
            <FeedManager />
          </div>
          <SponsorshipBanner />
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex min-w-0 flex-1 flex-col bg-background">
        <LifetimeAccessBanner />

        {/* Header */}
        <header className="flex-none border-b border-border">
          {/* Primary row */}
          <div className="flex h-14 items-center gap-2 px-3">
            <button
              onClick={() => setSidebarOpen(!isSidebarOpen)}
              className="rounded-lg p-2 text-foreground hover:bg-muted"
              title="Toggle Sidebar (b)"
            >
              <HiMenu className="h-5 w-5" />
            </button>

            {/* Prev / date / next */}
            <div className="flex items-center gap-1">
              <button
                onClick={handlePrevWeek}
                className="rounded-lg p-2 text-foreground hover:bg-muted"
                title="Previous (←)"
              >
                <IoChevronBack className="h-5 w-5" />
              </button>
              <h1 className="min-w-0 truncate text-base font-semibold text-foreground md:text-lg">
                {formatDate(currentDate)}
              </h1>
              <button
                onClick={handleNextWeek}
                className="rounded-lg p-2 text-foreground hover:bg-muted"
                title="Next (→)"
              >
                <IoChevronForward className="h-5 w-5" />
              </button>
            </div>

            {/* Desktop-only actions */}
            <div className="ml-2 hidden items-center gap-2 md:flex">
              <button
                onClick={() => setDate(newDate())}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted"
                title="Go to Today (t)"
              >
                Today
              </button>
              <button
                onClick={handleAutoSchedule}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/10"
              >
                Auto Schedule
              </button>
            </div>

            {/* Desktop-only view switcher */}
            <div className="ml-auto hidden items-center gap-1 md:flex">
              {viewButtons.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setView(key)}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-sm font-medium",
                    view === key
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Mobile-only secondary row */}
          <div className="flex items-center gap-1 border-t border-border px-3 py-2 md:hidden">
            <button
              onClick={() => setDate(newDate())}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted"
            >
              Today
            </button>
            <div className="ml-auto flex items-center gap-1">
              {viewButtons.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setView(key)}
                  className={cn(
                    "rounded-lg px-2.5 py-1.5 text-sm font-medium",
                    view === key
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </header>

        {/* Calendar Grid */}
        <div className="flex-1 overflow-hidden">
          {view === "day" ? (
            <DayView currentDate={currentDate} onDateClick={setDate} />
          ) : view === "week" ? (
            <WeekView currentDate={currentDate} onDateClick={setDate} />
          ) : view === "month" ? (
            <MonthView currentDate={currentDate} onDateClick={setDate} />
          ) : (
            <MultiMonthView currentDate={currentDate} onDateClick={setDate} />
          )}
        </div>
      </main>
    </div>
  );
}
