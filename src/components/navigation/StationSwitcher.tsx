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
}

export function StationSwitcher({ className }: StationSwitcherProps) {
  const { currentStation, setStation } = useStationStore();

  return (
    <div
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full border border-border bg-muted/60 p-0.5",
        className
      )}
    >
      {OPTIONS.map(({ value, label, icon: Icon }) => {
        const active = currentStation === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => setStation(value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
              active
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
            aria-pressed={active}
          >
            <Icon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
