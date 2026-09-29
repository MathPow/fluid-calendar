"use client";

import Link from "next/link";

import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Hammer,
  LayoutPanelTop,
  Mail,
} from "lucide-react";

import { timeAgoFr } from "@/lib/projets/meta";
import { cn } from "@/lib/utils";

import type { NotificationItem } from "./useNotifications";

const ICONS: Record<string, typeof Bell> = {
  email_reply: Mail,
  chantier_flag: Hammer,
  showcase_done: LayoutPanelTop,
  showcase_failed: AlertTriangle,
  done: CheckCircle2,
};

/** Rows of notifications; a click marks one read and follows its link. */
export function NotificationList({
  items,
  onOpen,
  dense,
}: {
  items: NotificationItem[];
  onOpen: (n: NotificationItem) => void;
  dense?: boolean;
}) {
  return (
    <ul>
      {items.map((n) => {
        const Icon = ICONS[n.kind] ?? Bell;
        const external = n.url && /^https?:\/\//.test(n.url);
        const inner = (
          <>
            <span
              className={cn(
                "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl",
                n.important && !n.readAt
                  ? "bg-foreground text-background"
                  : "bg-secondary text-muted-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span
                className={cn(
                  "block text-[14px] leading-snug",
                  n.readAt ? "text-foreground/80" : "font-semibold"
                )}
              >
                {n.title}
              </span>
              {n.body && (
                <span
                  className={cn(
                    "mt-0.5 block whitespace-pre-line text-[13px] leading-snug text-muted-foreground",
                    dense ? "line-clamp-2" : "line-clamp-3"
                  )}
                >
                  {n.body}
                </span>
              )}
              <span className="mt-1 block text-[11px] text-muted-foreground">
                {timeAgoFr(n.createdAt)}
              </span>
            </span>
            {!n.readAt && (
              <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-[hsl(var(--destructive))]" />
            )}
          </>
        );
        const cls =
          "flex w-full items-start gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors hover:bg-secondary";
        return (
          <li key={n.id}>
            {n.url ? (
              external ? (
                <a
                  href={n.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cls}
                  onClick={() => onOpen(n)}
                >
                  {inner}
                </a>
              ) : (
                <Link href={n.url} className={cls} onClick={() => onOpen(n)}>
                  {inner}
                </Link>
              )
            ) : (
              <button type="button" className={cls} onClick={() => onOpen(n)}>
                {inner}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
