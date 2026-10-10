"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Star } from "lucide-react";

import { Input } from "@/components/ui/input";

import { cn } from "@/lib/utils";

/** Someone the To/Cc/Bcc fields can suggest. */
export interface Recipient {
  name: string;
  email: string;
  /** From the Contacts page (vs. only seen in mail). */
  contact?: boolean;
  favorite?: boolean;
  company?: string | null;
}

const fold = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** « Name <email> », quoting a name nodemailer would otherwise split. */
const formatRecipient = (r: Recipient) => {
  if (!r.name || fold(r.name) === fold(r.email)) return r.email;
  const name = /[,;<>"@()]/.test(r.name)
    ? `"${r.name.replace(/"/g, "'")}"`
    : r.name;
  return `${name} <${r.email}>`;
};

/** Addresses already typed in the field, to leave them out of suggestions. */
const typedEmails = (value: string) =>
  new Set(
    (value.match(/[^\s<>,;"]+@[^\s<>,;"]+/g) ?? []).map((e) => e.toLowerCase())
  );

/**
 * A comma-separated address field that suggests contacts (then people seen in
 * mail) for the address being typed — the part after the last comma.
 */
export function RecipientInput({
  id,
  value,
  onChange,
  people,
  placeholder,
  autoFocus,
  onOpenChange,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  people: Recipient[];
  placeholder?: string;
  autoFocus?: boolean;
  /** Lets the dialog keep Esc for closing the list instead of itself. */
  onOpenChange?: (open: boolean) => void;
}) {
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const cut = Math.max(value.lastIndexOf(","), value.lastIndexOf(";"));
  const head = cut >= 0 ? value.slice(0, cut + 1) : "";
  const query = value.slice(cut + 1).trim();

  const matches = useMemo(() => {
    const q = fold(query);
    if (!q) return [];
    const taken = typedEmails(head);
    const scored: { r: Recipient; score: number }[] = [];
    for (const r of people) {
      if (taken.has(r.email.toLowerCase())) continue;
      const name = fold(r.name);
      const email = fold(r.email);
      let score = -1;
      if (name.startsWith(q) || email.startsWith(q)) score = 3;
      else if (name.split(/[\s'-]+/).some((w) => w.startsWith(q))) score = 2;
      else if (name.includes(q) || email.includes(q)) score = 1;
      if (score < 0) continue;
      if (r.contact) score += 2;
      if (r.favorite) score += 1;
      scored.push({ r, score });
    }
    return scored
      .sort((a, b) => b.score - a.score || a.r.name.localeCompare(b.r.name))
      .slice(0, 6)
      .map((s) => s.r);
  }, [people, query, head]);

  const open = focused && !dismissed && matches.length > 0;
  useEffect(() => {
    onOpenChange?.(open);
  }, [open, onOpenChange]);

  const pick = (r: Recipient) => {
    const before = head ? `${head.trimEnd()} ` : "";
    onChange(`${before}${formatRecipient(r)}, `);
    setActive(0);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
  };

  return (
    <div className="relative">
      <Input
        ref={inputRef}
        id={id}
        inputMode="email"
        autoComplete="off"
        autoFocus={autoFocus}
        value={value}
        placeholder={placeholder}
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-suggestions`}
        aria-autocomplete="list"
        onChange={(e) => {
          onChange(e.target.value);
          setActive(0);
          setDismissed(false);
        }}
        onFocus={() => setFocused(true)}
        // Late enough for a click on a suggestion to land first.
        onBlur={() => setTimeout(() => setFocused(false), 120)}
        onKeyDown={(e) => {
          if (!open) return;
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            const step = e.key === "ArrowDown" ? 1 : -1;
            setActive((i) => (i + step + matches.length) % matches.length);
          } else if (
            (e.key === "Enter" || e.key === "Tab") &&
            !e.metaKey &&
            !e.ctrlKey
          ) {
            e.preventDefault();
            pick(matches[Math.min(active, matches.length - 1)]);
          } else if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            setDismissed(true);
          }
        }}
      />
      {open && (
        <ul
          id={`${id}-suggestions`}
          role="listbox"
          className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-[20px] bg-card p-1 shadow-float"
        >
          {matches.map((r, i) => (
            <li
              key={r.email}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(r);
              }}
              onMouseEnter={() => setActive(i)}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-2xl px-3 py-2",
                i === active ? "bg-secondary" : "hover:bg-secondary/60"
              )}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-[12px] font-semibold uppercase text-foreground/80">
                {(r.name || r.email).slice(0, 1)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 truncate text-[14px] font-medium">
                  <span className="truncate">{r.name || r.email}</span>
                  {r.favorite && (
                    <Star className="h-3 w-3 shrink-0 fill-amber-400 text-amber-400" />
                  )}
                </span>
                <span className="block truncate text-[12px] text-muted-foreground">
                  {r.email}
                  {r.company ? ` · ${r.company}` : ""}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
