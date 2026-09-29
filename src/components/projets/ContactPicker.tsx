"use client";

import { useState } from "react";

import { Command } from "cmdk";
import { Check, ChevronsUpDown } from "lucide-react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

import { initials } from "@/lib/projets/meta";
import { cn } from "@/lib/utils";

import { Avatar } from "./ImageField";

export type PickerContact = {
  id: string;
  name: string;
  image: string | null;
  company: string | null;
  role: string | null;
};

/**
 * A searchable single-contact picker (Contacts tab entries). `fallbackLabel`
 * shows when nothing is linked yet, e.g. a name typed before contacts existed.
 */
export function ContactPicker({
  contacts,
  value,
  onChange,
  fallbackLabel,
  placeholder = "Choisir un contact",
}: {
  contacts: PickerContact[];
  value: string | null;
  onChange: (contact: PickerContact) => void;
  fallbackLabel?: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = contacts.find((c) => c.id === value) ?? null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-10 w-full min-w-0 items-center gap-2 rounded-xl bg-secondary px-3 text-left text-[14px] outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
          aria-expanded={open}
        >
          {selected ? (
            <>
              <Avatar
                image={selected.image}
                fallback={initials(selected.name)}
                color="#a8ccff"
                className="h-6 w-6 text-[9px]"
              />
              <span className="min-w-0 flex-1 truncate font-medium">
                {selected.name}
              </span>
            </>
          ) : (
            <span className="min-w-0 flex-1 truncate text-muted-foreground">
              {fallbackLabel ? `${fallbackLabel} · pas lié` : placeholder}
            </span>
          )}
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[min(22rem,calc(100vw-2rem))] p-0"
        align="start"
      >
        <Command
          filter={(itemValue, search) =>
            itemValue
              .normalize("NFD")
              .replace(/[̀-ͯ]/g, "")
              .toLowerCase()
              .includes(
                search.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
              )
              ? 1
              : 0
          }
        >
          <Command.Input
            placeholder="Rechercher un contact…"
            className="h-11 w-full border-b border-border bg-transparent px-3 text-[14px] outline-none placeholder:text-muted-foreground"
          />
          <Command.List className="max-h-72 overflow-y-auto p-1">
            <Command.Empty className="px-3 py-6 text-center text-[13px] text-muted-foreground">
              Aucun contact. Ajoute-le dans l&apos;onglet Contacts.
            </Command.Empty>
            {contacts.map((c) => (
              <Command.Item
                key={c.id}
                value={`${c.name} ${c.company ?? ""} ${c.role ?? ""} ${c.id}`}
                onSelect={() => {
                  onChange(c);
                  setOpen(false);
                }}
                className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-[14px] data-[selected=true]:bg-secondary"
              >
                <Avatar
                  image={c.image}
                  fallback={initials(c.name)}
                  color="#a8ccff"
                  className="h-7 w-7 text-[10px]"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{c.name}</span>
                  {(c.company || c.role) && (
                    <span className="block truncate text-[12px] text-muted-foreground">
                      {[c.role, c.company].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </span>
                <Check
                  className={cn(
                    "h-4 w-4",
                    c.id === value ? "opacity-100" : "opacity-0"
                  )}
                />
              </Command.Item>
            ))}
          </Command.List>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
