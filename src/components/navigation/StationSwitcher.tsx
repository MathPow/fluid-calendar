"use client";

import { Briefcase, Check, ChevronDown, Layers, User } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { cn } from "@/lib/utils";

import { Station, useStationStore } from "@/store/station";

const OPTIONS: {
  value: Station;
  label: string;
  hint: string;
  icon: typeof User;
}[] = [
  { value: "personal", label: "Personal", hint: "Perso only", icon: User },
  { value: "work", label: "Work", hint: "Clients only", icon: Briefcase },
  { value: "both", label: "Both", hint: "Everything", icon: Layers },
];

interface StationSwitcherProps {
  className?: string;
}

/** Pill dropdown that picks the active station (personal / work / both). */
export function StationSwitcher({ className }: StationSwitcherProps) {
  const { currentStation, setStation } = useStationStore();
  const current = OPTIONS.find((o) => o.value === currentStation) ?? OPTIONS[2];
  const CurrentIcon = current.icon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-10 shrink-0 items-center gap-2 rounded-full bg-secondary px-3 text-[13px] font-medium text-foreground transition-colors hover:bg-border/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            className
          )}
          aria-label={`Station: ${current.label}`}
          title="Station"
        >
          <CurrentIcon className="h-4 w-4" />
          <span className="hidden sm:inline">{current.label}</span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={10} className="w-52">
        <p className="etiquette px-3 pb-2 pt-1">Station</p>
        {OPTIONS.map(({ value, label, hint, icon: Icon }) => {
          const active = value === currentStation;
          return (
            <DropdownMenuItem
              key={value}
              onSelect={() => setStation(value)}
              className={cn("cursor-pointer", active && "bg-tint-soft")}
            >
              <Icon />
              <span className="flex-1">
                <span className="block font-medium">{label}</span>
                <span className="block text-[11px] text-muted-foreground">{hint}</span>
              </span>
              {active && <Check className="h-4 w-4 !text-foreground" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
