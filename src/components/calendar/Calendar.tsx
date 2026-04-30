"use client";

import { useEffect } from "react";

import dynamic from "next/dynamic";
import { BsCalendarPlus } from "react-icons/bs";
import { HiMenu } from "react-icons/hi";
import { IoChevronBack, IoChevronForward } from "react-icons/io5";
import {
  MdCalendarViewDay,
  MdCalendarViewMonth,
  MdCalendarViewWeek,
  MdDateRange,
  MdToday,
} from "react-icons/md";

import { DayView } from "@/components/calendar/DayView";
import { FeedManager } from "@/components/calendar/FeedManager";
import { MonthView } from "@/components/calendar/MonthView";
import { MultiMonthView } from "@/components/calendar/MultiMonthView";
import { WeekView } from "@/components/calendar/WeekView";
import { SponsorshipBanner } from "@/components/ui/sponsorship-banner";

import { addDays, formatDate, newDate, subDays } from "@/lib/date-utils";
import { isSaasEnabled } from "@/lib/config";
import { cn } from "@/lib/utils";

import { useEventModalStore } from "@/lib/commands/groups/calendar";

import {
  useCalendarStore,
  useCalendarUIStore,
  useViewStore,
} from "@/store/calendar";
import { useTaskStore } from "@/store/task";

import { CalendarEvent, CalendarFeed } from "@/types/calendar";

const LifetimeAccessBanner = dynamic(
  () =>
    import(`./LifetimeAccessBanner.${isSaasEnabled ? "saas" : "open"}`).then(
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
  const { scheduleAllTasks: handleAutoSchedule } = useTaskStore();
  const { setFeeds, setEvents } = useCalendarStore();
  const eventModal = useEventModalStore();

  useEffect(() => {
    if (initialFeeds.length > 0) setFeeds(initialFeeds);
    if (initialEvents.length > 0) setEvents(initialEvents);
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

  const handlePrev = () => {
    if (view === "month" || view === "multiMonth") {
      const d = new Date(currentDate);
      d.setMonth(d.getMonth() - 1);
      setDate(d);
    } else {
      setDate(subDays(currentDate, view === "day" ? 1 : 7));
    }
  };

  const handleNext = () => {
    if (view === "month" || view === "multiMonth") {
      const d = new Date(currentDate);
      d.setMonth(d.getMonth() + 1);
      setDate(d);
    } else {
      setDate(addDays(currentDate, view === "day" ? 1 : 7));
    }
  };

  const desktopViewButtons = [
    { key: "day", label: "Day" },
    { key: "week", label: "Week" },
    { key: "month", label: "Month" },
    { key: "multiMonth", label: "Year" },
  ] as const;

  const mobileNavItems = [
    { key: "day", label: "Day", icon: MdCalendarViewDay },
    { key: "week", label: "Week", icon: MdCalendarViewWeek },
    { key: "month", label: "Month", icon: MdCalendarViewMonth },
    { key: "multiMonth", label: "Year", icon: MdDateRange },
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
          "fixed inset-y-0 left-0 z-40",
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
        <header className="flex h-14 flex-none items-center gap-2 border-b border-border px-3">
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
              onClick={handlePrev}
              className="rounded-lg p-2 text-foreground hover:bg-muted"
              title="Previous (←)"
            >
              <IoChevronBack className="h-5 w-5" />
            </button>
            <h1 className="min-w-0 truncate text-base font-semibold text-foreground md:text-lg">
              {formatDate(currentDate)}
            </h1>
            <button
              onClick={handleNext}
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
            {desktopViewButtons.map(({ key, label }) => (
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

          {/* Mobile-only add button */}
          <button
            onClick={() => eventModal.setOpen(true)}
            className="ml-auto rounded-full bg-primary p-2.5 text-primary-foreground shadow-md md:hidden"
            title="New event"
          >
            <BsCalendarPlus className="h-5 w-5" />
          </button>
        </header>

        {/* Calendar Grid — extra bottom padding on mobile for the bottom nav */}
        <div className="flex-1 overflow-hidden pb-16 md:pb-0">
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

        {/* Mobile-only bottom nav */}
        <nav className="fixed bottom-0 left-0 right-0 z-20 flex border-t border-border bg-background md:hidden">
          {mobileNavItems.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setView(key)}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-0.5 py-3",
                "text-xs font-medium transition-colors",
                view === key
                  ? "text-primary"
                  : "text-muted-foreground"
              )}
            >
              <Icon className="h-5 w-5" />
              {label}
            </button>
          ))}
          {/* Today shortcut */}
          <button
            onClick={() => setDate(newDate())}
            className="flex flex-1 flex-col items-center justify-center gap-0.5 py-3 text-xs font-medium text-muted-foreground transition-colors"
          >
            <MdToday className="h-5 w-5" />
            Today
          </button>
        </nav>
      </main>
    </div>
  );
}
