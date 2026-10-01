import {
  format,
  isFutureDate,
  isThisWeek,
  isThisYear,
  isToday,
  isTomorrow,
  newDate,
  newDateFromYMD,
} from "@/lib/date-utils";

import { Priority, TaskStatus, TimePreference } from "@/types/task";

export const statusColors = {
  [TaskStatus.BACKLOG]: "bg-slate-500/20 text-slate-700 dark:text-slate-400",
  [TaskStatus.READY]: "bg-violet-500/20 text-violet-700 dark:text-violet-300",
  [TaskStatus.BLOCKED]: "bg-red-500/20 text-red-700 dark:text-red-400",
  [TaskStatus.TODO]: "bg-yellow-500/20 text-yellow-700 dark:text-yellow-400",
  [TaskStatus.IN_PROGRESS]: "bg-blue-500/20 text-blue-700 dark:text-blue-400",
  [TaskStatus.COMPLETED]: "bg-green-500/20 text-green-700 dark:text-green-400",
};

export const energyLevelColors = {
  high: "bg-red-500/20 text-red-700 dark:text-red-400",
  medium: "bg-orange-500/20 text-orange-700 dark:text-orange-400",
  low: "bg-green-500/20 text-green-700 dark:text-green-400",
};

export const timePreferenceColors = {
  [TimePreference.MORNING]: "bg-sky-500/20 text-sky-700 dark:text-sky-400",
  [TimePreference.AFTERNOON]:
    "bg-amber-500/20 text-amber-700 dark:text-amber-400",
  [TimePreference.EVENING]:
    "bg-indigo-500/20 text-indigo-700 dark:text-indigo-400",
};

export const priorityColors = {
  [Priority.HIGH]: "bg-red-500/20 text-red-700 dark:text-red-400",
  [Priority.MEDIUM]: "bg-orange-500/20 text-orange-700 dark:text-orange-400",
  [Priority.LOW]: "bg-blue-500/20 text-blue-700 dark:text-blue-400",
  [Priority.NONE]: "bg-muted text-muted-foreground",
};

export type ContextualDateKind = "today" | "tomorrow" | "weekday" | "date";

export interface ContextualDate {
  kind: ContextualDateKind;
  /** Pre-formatted base (weekday name or short/long date). Empty for today/tomorrow. */
  base: string;
  isOverdue: boolean;
  isFuture: boolean;
}

/**
 * Break a date into a `{ kind, base }` shape so the caller can translate.
 * `utcMidnight` reinterprets a UTC-midnight value (e.g. dueDate) as a local date.
 */
export const contextualDate = (
  date: Date,
  options?: { utcMidnight?: boolean }
): ContextualDate => {
  const localDate = options?.utcMidnight
    ? newDateFromYMD(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate()
      )
    : date;

  const now = newDate();
  if (options?.utcMidnight) now.setHours(0, 0, 0, 0);

  const isOverdue = localDate < now && !isToday(localDate);
  const isFuture = isFutureDate(localDate);

  if (isToday(localDate)) {
    return { kind: "today", base: "", isOverdue, isFuture };
  }
  if (isTomorrow(localDate)) {
    return { kind: "tomorrow", base: "", isOverdue, isFuture };
  }
  if (isThisWeek(localDate)) {
    return {
      kind: "weekday",
      base: format(localDate, "EEEE"),
      isOverdue,
      isFuture,
    };
  }
  if (isThisYear(localDate)) {
    return {
      kind: "date",
      base: format(localDate, "MMM d"),
      isOverdue,
      isFuture,
    };
  }
  return {
    kind: "date",
    base: format(localDate, "MMM d, yyyy"),
    isOverdue,
    isFuture,
  };
};
