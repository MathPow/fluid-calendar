"use client";

import { useMemo } from "react";

import { type Recipient, RecipientInput } from "@/components/email/RecipientInput";
import { Label } from "@/components/ui/label";

import { useT } from "@/i18n/client";

import type { FactContact } from "./types";

/** The Cc addresses of an invoice: several of them, with contact suggestions. */
export function CcField({
  id,
  value,
  onChange,
  contacts,
  onSuggestionsOpen,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  contacts: FactContact[];
  /** Lets the dialog keep Esc for closing the list instead of itself. */
  onSuggestionsOpen: (open: boolean) => void;
}) {
  const t = useT();
  const people = useMemo<Recipient[]>(
    () =>
      contacts.flatMap((c) =>
        c.email?.trim()
          ? [{ name: c.name, email: c.email.trim(), company: c.company, contact: true }]
          : []
      ),
    [contacts]
  );

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{t("facturation.send.cc")}</Label>
      <RecipientInput
        id={id}
        value={value}
        onChange={onChange}
        people={people}
        onOpenChange={onSuggestionsOpen}
        placeholder="comptable@client.com, associe@client.com"
      />
      <p className="text-[12px] text-muted-foreground">{t("facturation.send.ccHint")}</p>
    </div>
  );
}
