"use client";

import { useT } from "@/i18n/client";
import { ClipboardPaste, X } from "lucide-react";

import { useCalendarClipboard } from "@/store/calendarClipboard";

/** Paste-mode strip: what's copied and how to drop it on another slot. */
export function ClipboardBar() {
  const t = useT();
  const clip = useCalendarClipboard((s) => s.clip);
  const setClip = useCalendarClipboard((s) => s.setClip);
  if (!clip) return null;
  const title = clip.kind === "routine" ? clip.block.title : clip.title;

  return (
    <div className="flex flex-none items-center gap-3 border-b border-border bg-tint-soft px-4 py-2.5 md:px-5">
      <ClipboardPaste className="h-4 w-4 shrink-0" />
      <p className="min-w-0 flex-1 text-[13px] leading-snug">
        <span className="font-semibold">
          {t("calendar.clipboard.bar.title", { title })}
        </span>{" "}
        <span className="text-muted-foreground">
          {t("calendar.clipboard.bar.hint")}
        </span>
      </p>
      <button
        type="button"
        onClick={() => setClip(null)}
        className="flex shrink-0 items-center gap-1 rounded-full bg-foreground px-3.5 py-1.5 text-[12px] font-semibold text-background"
      >
        <X className="h-3.5 w-3.5" />
        {t("calendar.clipboard.bar.done")}
      </button>
    </div>
  );
}
