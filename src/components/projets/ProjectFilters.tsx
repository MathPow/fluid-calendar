"use client";

import { Check, ChevronDown, Search, X } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { cn } from "@/lib/utils";

export type FilterOption = { id: string; label: string; count: number };

export type ProjectFilterState = {
  query: string;
  organisations: string[];
  machines: string[];
  stack: string[];
  withShowcase: boolean;
};

export const EMPTY_FILTERS: ProjectFilterState = {
  query: "",
  organisations: [],
  machines: [],
  stack: [],
  withShowcase: false,
};

export const filtersActive = (f: ProjectFilterState) =>
  f.query.trim() !== "" ||
  f.organisations.length > 0 ||
  f.machines.length > 0 ||
  f.stack.length > 0 ||
  f.withShowcase;

/** Lower-case, accent-free text for matching: « Équipement » finds « equipement ». */
export const fold = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Search field + filter menus above the Projets board: organisation,
 * machine, tech, and « avec présentation ».
 */
export function ProjectFilters({
  value,
  onChange,
  organisations,
  machines,
  stack,
  resultCount,
}: {
  value: ProjectFilterState;
  onChange: (next: ProjectFilterState) => void;
  organisations: FilterOption[];
  machines: FilterOption[];
  stack: FilterOption[];
  resultCount: number;
}) {
  const set = <K extends keyof ProjectFilterState>(
    key: K,
    v: ProjectFilterState[K]
  ) => onChange({ ...value, [key]: v });
  const toggleIn = (key: "organisations" | "machines" | "stack", id: string) =>
    set(
      key,
      value[key].includes(id)
        ? value[key].filter((x) => x !== id)
        : [...value[key], id]
    );
  const active = filtersActive(value);

  return (
    <div className="mt-6 space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={value.query}
          onChange={(e) => set("query", e.target.value)}
          placeholder="Rechercher un projet, une techno, un lien, un contact…"
          className="h-12 w-full rounded-full bg-secondary pl-11 pr-11 text-[15px] outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
        />
        {value.query && (
          <button
            type="button"
            onClick={() => set("query", "")}
            className="absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-card hover:text-foreground"
            aria-label="Effacer la recherche"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <FilterMenu
          label="Organisation"
          options={organisations}
          selected={value.organisations}
          onToggle={(id) => toggleIn("organisations", id)}
        />
        {machines.length > 0 && (
          <FilterMenu
            label="Machine"
            options={machines}
            selected={value.machines}
            onToggle={(id) => toggleIn("machines", id)}
          />
        )}
        {stack.length > 0 && (
          <FilterMenu
            label="Techno"
            options={stack}
            selected={value.stack}
            onToggle={(id) => toggleIn("stack", id)}
          />
        )}
        <button
          type="button"
          onClick={() => set("withShowcase", !value.withShowcase)}
          aria-pressed={value.withShowcase}
          className={cn(
            "inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium transition-colors",
            value.withShowcase
              ? "bg-foreground text-background"
              : "bg-secondary text-foreground/80 hover:text-foreground"
          )}
        >
          {value.withShowcase && <Check className="h-3.5 w-3.5" />}
          Avec présentation
        </button>
        {active && (
          <>
            <span className="ml-1 text-[13px] text-muted-foreground">
              {resultCount} projet{resultCount > 1 ? "s" : ""}
            </span>
            <button
              type="button"
              onClick={() => onChange(EMPTY_FILTERS)}
              className="text-[13px] font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              Tout effacer
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function FilterMenu({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: FilterOption[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  const on = selected.length > 0;
  const summary =
    selected.length === 1
      ? options.find((o) => o.id === selected[0])?.label
      : on
        ? `${selected.length}`
        : null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex h-9 max-w-[16rem] items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium transition-colors",
            on
              ? "bg-foreground text-background"
              : "bg-secondary text-foreground/80 hover:text-foreground"
          )}
        >
          <span className="truncate">
            {label}
            {summary && ` · ${summary}`}
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 overflow-y-auto">
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {options.map((o) => (
          <DropdownMenuCheckboxItem
            key={o.id}
            checked={selected.includes(o.id)}
            onCheckedChange={() => onToggle(o.id)}
            // Keep the menu open to pick several.
            onSelect={(e) => e.preventDefault()}
          >
            <span className="flex-1 truncate">{o.label}</span>
            <span className="ml-3 text-[11px] text-muted-foreground">
              {o.count}
            </span>
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
