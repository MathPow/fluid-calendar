"use client";

import { Briefcase, Layers, User } from "lucide-react";

import { cn } from "@/lib/utils";

import { Station, useStationStore } from "@/store/station";

const OPTIONS: { value: Station; label: string; icon: typeof User }[] = [
  { value: "personal", label: "Personal", icon: User },
  { value: "work", label: "Work", icon: Briefcase },
  { value: "both", label: "Both", icon: Layers },
];

interface StationSwitcherProps {
  className?: string;
  /** Icons only until the 2xl breakpoint (used in the tight header). */
  compact?: boolean;
}

/** Segmented pill that picks the active station (personal / work / both). */
export function StationSwitcher({ className, compact }: StationSwitcherProps) {
  const { currentStation, setStation } = useStationStore();

  return (
    <div
      className={cn("segmented", className)}
      role="group"
      aria-label="Station"
    >
      {OPTIONS.map(({ value, label, icon: Icon }) => {
        const active = currentStation === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => setStation(value)}
            className="segmented-item flex-1"
            aria-pressed={active}
            title={label}
          >
            <Icon className="h-3.5 w-3.5" />
            <span className={cn(compact && "hidden 2xl:inline")}>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
