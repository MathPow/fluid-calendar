"use client";

import { useEffect, useRef, useState } from "react";

import dynamic from "next/dynamic";

import {
  CalendarDays,
  Calendar as CalendarIcon,
  CalendarPlus,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Menu,
  PenLine,
} from "lucide-react";

import { ClipboardBar } from "@/components/calendar/ClipboardBar";
import { CalendarStatsButton } from "@/components/calendar/CalendarStats";
import { DayView } from "@/components/calendar/DayView";
import { FeedManager } from "@/components/calendar/FeedManager";
import { MonthView } from "@/components/calendar/MonthView";
import { MultiMonthView } from "@/components/calendar/MultiMonthView";
import { RoutineBlockDialog } from "@/components/calendar/RoutineBlockDialog";
import { RoutineLayers } from "@/components/calendar/RoutineLayers";
import { WeekView } from "@/components/calendar/WeekView";

import { useDeepLink } from "@/hooks/use-deep-link";

import { useLocale, useT } from "@/i18n/client";
import { useEventModalStore } from "@/lib/commands/groups/calendar";
import { isSaasEnabled } from "@/lib/config";
import { addDays, formatDate, newDate, subDays } from "@/lib/date-utils";
import { cn } from "@/lib/utils";

import {
  useCalendarStore,
  useCalendarUIStore,
  useViewStore,
} from "@/store/calendar";
import { useRoutineStore } from "@/store/routine";
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
  const t = useT();
  const locale = useLocale();
  const { date: currentDate, setDate, view, setView } = useViewStore();
  const { isSidebarOpen, setSidebarOpen, isHydrated } = useCalendarUIStore();
  const { scheduleAllTasks: handleAutoSchedule } = useTaskStore();
  const { setFeeds, setEvents } = useCalendarStore();
  const eventModal = useEventModalStore();
  const [pickerOpen, setPickerOpen] = useState(false);
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const routineEditing = useRoutineStore((s) => s.editing);

  useEffect(() => {
    useRoutineStore.getState().load();
    // Leave « Dessiner » mode when leaving the calendar.
    return () => useRoutineStore.getState().setEditing(false);
  }, []);

  useEffect(() => {
    if (initialFeeds.length > 0) setFeeds(initialFeeds);
    if (initialEvents.length > 0) setEvents(initialEvents);
    if (!initialFeeds.length || !initialEvents.length) {
      useCalendarStore.getState().loadFromDatabase();
    }
    useTaskStore.getState().fetchTasks();
  }, [initialFeeds, initialEvents, setFeeds, setEvents]);

  // Default to day view on mobile, with the calendar drawer closed so the
  // grid isn't hidden behind it on first load.
  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      setView("day");
      setSidebarOpen(false);
    }
  }, [setView, setSidebarOpen]);

  // /calendar?date=YYYY-MM-DD jumps to that day (links from the assistant).
  useDeepLink("/calendar", (params) => {
    const m = params.get("date")?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return;
    setDate(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    setView("day");
  });

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
    { key: "day", label: t("calendar.view.day"), icon: CalendarIcon },
    { key: "week", label: t("calendar.view.week"), icon: Columns3 },
    { key: "month", label: t("calendar.view.month"), icon: CalendarDays },
    { key: "multiMonth", label: t("calendar.view.year"), icon: CalendarRange },
  ] as const;

  return (
    <div className="flex h-full w-full overflow-hidden md:p-4 lg:p-5">
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
          "h-full w-80 flex-none border-r border-border bg-card",
          // Desktop: a rounded panel beside the calendar, like Email.
          "md:mr-4 md:overflow-hidden md:rounded-[28px] md:border-r-0 md:shadow-tile",
          "transform transition-transform duration-300 ease-in-out",
          "fixed inset-y-0 left-0 z-40",
          "md:relative md:z-auto",
          !isHydrated && "opacity-0 duration-0",
          isSidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
        style={{ marginLeft: isSidebarOpen ? 0 : "-21rem" }}
      >
        <div className="flex h-full flex-col">
          <div className="flex-1 overflow-y-auto">
            <FeedManager />
            <RoutineLayers />
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex min-w-0 flex-1 flex-col bg-background md:overflow-hidden md:rounded-[28px] md:bg-card md:shadow-tile">
        <LifetimeAccessBanner />

        {/* Header */}
        <header className="flex h-16 flex-none items-center gap-2 border-b border-border px-3 md:px-5">
          <button
            onClick={() => setSidebarOpen(!isSidebarOpen)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full p-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
            title="Toggle Sidebar (b)"
            aria-label={t("calendar.header.showCalendars")}
          >
            <Menu className="h-5 w-5" />
          </button>

          {/* Prev / date / next */}
          <div className="flex items-center gap-1">
            <button
              onClick={handlePrev}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full p-2 text-foreground hover:bg-secondary"
              title="Previous (←)"
              aria-label={t("calendar.header.prevDay")}
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <h1 className="min-w-0 truncate text-[18px] font-bold tracking-title text-foreground md:text-[22px]">
              <button
                type="button"
                className="min-h-10 max-w-full truncate md:hidden"
                onClick={() => setPickerOpen(!pickerOpen)}
                aria-expanded={pickerOpen}
                aria-label={t("calendar.header.pickDate")}
              >
                {currentDate.toLocaleDateString(locale === "fr" ? "fr-FR" : "en-US", {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                })}
              </button>
              <span className="hidden md:inline">
                {formatDate(currentDate)}
              </span>
            </h1>
            <button
              onClick={handleNext}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full p-2 text-foreground hover:bg-secondary"
              title="Next (→)"
              aria-label={t("calendar.header.nextDay")}
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>

          {/* Desktop-only actions */}
          <div className="ml-2 hidden items-center gap-2 md:flex">
            <button
              onClick={() => setDate(newDate())}
              className="rounded-full px-3.5 py-1.5 text-[13px] font-medium text-foreground hover:bg-secondary"
              title="Go to Today (t)"
            >
              Today
            </button>
            <button
              onClick={handleAutoSchedule}
              className="rounded-full border-[1.5px] border-foreground px-3.5 py-1 text-[13px] font-semibold text-foreground transition-colors hover:bg-foreground hover:text-background"
            >
              Auto Schedule
            </button>
          </div>

          {/* Desktop-only view switcher, with the stats bubble */}
          <CalendarStatsButton className="ml-auto hidden md:flex" />
          <div className="segmented hidden md:inline-flex">
            {desktopViewButtons.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setView(key)}
                className="segmented-item"
                data-active={view === key}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Mobile-only add button */}
          <button
            onClick={() => eventModal.setOpen(true)}
            className="ml-auto rounded-full bg-primary p-2.5 text-primary-foreground shadow-float md:hidden"
            title="New event"
            aria-label={t("calendar.header.newEvent")}
          >
            <CalendarPlus className="h-5 w-5" />
          </button>
        </header>

        <div className="flex flex-none flex-wrap items-center gap-2 border-b border-border px-3 py-1 md:hidden">
          {mobileNavItems.map(({ key, label }) => (
            <button
              type="button"
              key={key}
              aria-pressed={view === key}
              onClick={() => setView(key)}
              className={cn(
                "min-h-10 flex-1 rounded-xl px-2 text-xs font-medium",
                view === key
                  ? "bg-foreground text-background"
                  : "bg-secondary text-foreground"
              )}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setDate(newDate())}
            className="min-h-10 rounded-xl px-2 text-xs"
          >
            {t("calendar.header.today")}
          </button>
          <CalendarStatsButton className="h-10 w-10" />
          {pickerOpen && (
            <input
              aria-label={t("calendar.header.pickDay")}
              type="date"
              className="h-11 w-full rounded-xl bg-input px-3 text-base text-foreground"
              value={`${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, "0")}-${String(currentDate.getDate()).padStart(2, "0")}`}
              onChange={(e) => {
                if (e.target.value) {
                  const [y, m, d] = e.target.value.split("-").map(Number);
                  setDate(new Date(y, m - 1, d));
                  setPickerOpen(false);
                }
              }}
            />
          )}
        </div>
        {routineEditing && (
          <div className="flex flex-none items-center gap-3 border-b border-border bg-tint-soft px-4 py-2.5 md:px-5">
            <PenLine className="h-4 w-4 shrink-0" />
            <p className="min-w-0 flex-1 text-[13px] leading-snug">
              <span className="font-semibold">Semaine type.</span>{" "}
              <span className="text-muted-foreground">
                Glisse dans la grille pour créer un bloc, déplace-le ou
                étire-le. Touche un bloc pour le modifier.
              </span>
            </p>
            <button
              type="button"
              onClick={() => useRoutineStore.getState().setEditing(false)}
              className="shrink-0 rounded-full bg-foreground px-3.5 py-1.5 text-[12px] font-semibold text-background"
            >
              Terminer
            </button>
          </div>
        )}

        <ClipboardBar />

        {/* Calendar Grid — extra bottom padding on mobile for the bottom nav */}
        <div
          className="min-h-0 flex-1 overflow-hidden"
          onTouchStart={(e) => {
            if (
              window.innerWidth >= 768 ||
              view !== "day" ||
              routineEditing ||
              (e.target as HTMLElement).closest(".fc-event")
            )
              return;
            const touch = e.touches[0];
            swipeStart.current = { x: touch.clientX, y: touch.clientY };
          }}
          onTouchEnd={(e) => {
            const start = swipeStart.current;
            swipeStart.current = null;
            if (!start) return;
            const touch = e.changedTouches[0];
            const dx = touch.clientX - start.x;
            if (Math.abs(dx) > 80 && Math.abs(touch.clientY - start.y) < 40)
              setDate(addDays(currentDate, dx < 0 ? 1 : -1));
          }}
          onTouchCancel={() => {
            swipeStart.current = null;
          }}
        >
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
      <RoutineBlockDialog />
    </div>
  );
}
