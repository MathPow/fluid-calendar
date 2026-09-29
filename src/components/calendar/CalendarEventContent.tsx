import { memo, useEffect } from "react";

import type { EventContentArg } from "@fullcalendar/core";
import { CircleCheck, Clock, Repeat } from "lucide-react";

import { isTaskOverdue } from "@/lib/task-utils";
import { cn } from "@/lib/utils";

import { useOrganisationsStore } from "@/store/organisations";

import { Priority, TaskStatus } from "@/types/task";

/** The organisation's logo (or initial on its colour), sized for a block. */
function OrgMark({ id }: { id: string }) {
  const org = useOrganisationsStore((s) => s.organisations.find((o) => o.id === id));
  const load = useOrganisationsStore((s) => s.load);
  useEffect(() => {
    load();
  }, [load]);
  if (!org) return null;
  return org.image ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={org.image}
      alt={org.name}
      title={org.name}
      className="h-4 w-4 flex-shrink-0 rounded-[5px] bg-white object-cover ring-1 ring-black/10"
    />
  ) : (
    <span
      title={org.name}
      className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-[5px] text-[9px] font-bold text-[#19181c] ring-1 ring-black/10"
      style={{ backgroundColor: org.color ?? "#d9d4cc" }}
    >
      {org.name.charAt(0).toUpperCase()}
    </span>
  );
}

/** Ink on light backgrounds, paper on dark ones — whatever the theme. */
function readableOn(background: string | undefined): string | undefined {
  if (!background) return undefined;
  const m = background.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return undefined; // hsl(var(--…)) and friends: leave the theme colour
  let hex = m[1];
  if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return luminance > 0.45 ? "#19181c" : "#ffffff";
}

interface CalendarEventContentProps {
  eventInfo: EventContentArg;
}

const priorityColors = {
  [Priority.HIGH]: "border-destructive",
  [Priority.MEDIUM]: "border-pending-foreground",
  [Priority.LOW]: "border-tint",
  [Priority.NONE]: "border-muted-foreground",
};

export const CalendarEventContent = memo(function CalendarEventContent({
  eventInfo,
}: CalendarEventContentProps) {
  const isTask = eventInfo.event.extendedProps.isTask;
  const isRecurring = eventInfo.event.extendedProps.isRecurring;
  const status = eventInfo.event.extendedProps.status;
  const priority = eventInfo.event.extendedProps.priority;
  const location = eventInfo.event.extendedProps.location;
  const dueDate = eventInfo.event.extendedProps?.extendedProps?.dueDate;
  const title = eventInfo.event.title;
  const organisationId: string | null | undefined = eventInfo.event.extendedProps.organisationId;
  const endTime = eventInfo.event.end?.getTime() ?? 0;
  const startTime = eventInfo.event.start?.getTime() ?? 0;
  const duration = endTime - startTime;

  const isOverdue = isTask && isTaskOverdue({ dueDate, status });
  const textColor = readableOn(eventInfo.backgroundColor || eventInfo.event.backgroundColor);

  return (
    <div
      data-testid={isTask ? "calendar-task" : "calendar-event"}
      className={cn(
        "flex h-full flex-col justify-start gap-1 overflow-hidden text-[11px]",
        isTask && "border-l-4",
        isTask && priority && priorityColors[priority as Priority],
        isTask &&
          !priority && {
            "border-positive-foreground": status === TaskStatus.COMPLETED,
            "border-pending-foreground": status === TaskStatus.IN_PROGRESS,
            "border-muted-foreground": status === TaskStatus.TODO,
          },
        isOverdue && "border-destructive font-medium",
        status === TaskStatus.COMPLETED && "line-through opacity-60"
      )}
      style={textColor ? { color: textColor } : undefined}
    >
      <div className="flex w-full items-center gap-1.5">
        {!isTask && organisationId ? (
          <OrgMark id={organisationId} />
        ) : isTask ? (
          <CircleCheck className="h-3.5 w-3.5 flex-shrink-0 text-current opacity-75" />
        ) : isRecurring ? (
          <Repeat className="h-3.5 w-3.5 flex-shrink-0 text-current opacity-75" />
        ) : (
          <Clock className="h-3.5 w-3.5 flex-shrink-0 text-current opacity-75" />
        )}
        <div className="min-w-0 flex-1">
          <div
            className={cn(
              "calendar-event-title font-medium leading-snug",
              duration <= 1800000 ? "truncate" : "line-clamp-2 break-words"
            )}
          >
            {title}
          </div>
        </div>
      </div>
      {location && duration > 1800000 && (
        <div className="event-location truncate pl-5 text-[10px] leading-snug opacity-80">
          {location}
        </div>
      )}
    </div>
  );
});
