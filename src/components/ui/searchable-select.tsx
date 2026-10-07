"use client";

import { useMemo, useState } from "react";

import { Command } from "cmdk";
import { Check, ChevronsUpDown, Plus } from "lucide-react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";

type Option = { value: string; label: string };

const strip = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * A single-choice searchable combobox. Set `allowCustom` to let the user pick
 * a free-typed value in addition to the presets.
 */
export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder,
  emptyLabel,
  allowCustom = false,
  id,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  options: readonly Option[];
  placeholder?: string;
  emptyLabel?: string;
  allowCustom?: boolean;
  id?: string;
  className?: string;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const resolvedPlaceholder = placeholder ?? t("searchableSelect.placeholder");
  const resolvedEmpty = emptyLabel ?? t("searchableSelect.empty");

  const selected = useMemo(
    () => options.find((o) => o.value === value),
    [options, value]
  );
  const label = selected?.label ?? (value || "");
  const trimmed = search.trim();
  const showAdd =
    allowCustom &&
    trimmed.length > 0 &&
    !options.some((o) => strip(o.label) === strip(trimmed));

  const pick = (v: string) => {
    onChange(v);
    setSearch("");
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          id={id}
          className={cn(
            "flex h-10 w-full min-w-0 items-center gap-2 rounded-xl bg-secondary px-3 text-left text-[14px] outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring",
            className
          )}
          aria-expanded={open}
        >
          <span
            className={cn(
              "min-w-0 flex-1 truncate",
              !label && "text-muted-foreground"
            )}
          >
            {label || resolvedPlaceholder}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[min(22rem,calc(100vw-2rem))] p-0"
        align="start"
      >
        <Command
          filter={(itemValue, q) =>
            strip(itemValue).includes(strip(q)) ? 1 : 0
          }
        >
          <Command.Input
            value={search}
            onValueChange={setSearch}
            placeholder={t("searchableSelect.search")}
            className="h-11 w-full border-b border-border bg-transparent px-3 text-[14px] outline-none placeholder:text-muted-foreground"
            onKeyDown={(e) => {
              if (e.key === "Enter" && showAdd) {
                e.preventDefault();
                pick(trimmed);
              }
            }}
          />
          <Command.List className="max-h-72 overflow-y-auto p-1">
            <Command.Empty className="px-3 py-6 text-center text-[13px] text-muted-foreground">
              {resolvedEmpty}
            </Command.Empty>
            {options.map((o) => (
              <Command.Item
                key={o.value}
                value={`${o.label} ${o.value}`}
                onSelect={() => pick(o.value)}
                className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-[14px] aria-selected:bg-muted"
              >
                <span className="min-w-0 flex-1 truncate">{o.label}</span>
                {value === o.value && (
                  <Check className="h-4 w-4 text-muted-foreground" />
                )}
              </Command.Item>
            ))}
            {showAdd && (
              <Command.Item
                value={`__add__ ${trimmed}`}
                onSelect={() => pick(trimmed)}
                className="mt-1 flex cursor-pointer items-center gap-2 rounded-lg border-t border-border px-2 py-1.5 text-[13px] text-muted-foreground aria-selected:bg-muted"
              >
                <Plus className="h-4 w-4" />
                <span className="truncate">{t("searchableSelect.add", { label: trimmed })}</span>
              </Command.Item>
            )}
          </Command.List>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
