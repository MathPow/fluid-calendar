"use client";

import Link from "next/link";

import {
  AlertTriangle,
  Bell,
  Check,
  CheckCircle2,
  Hammer,
  LayoutPanelTop,
  Mail,
  Trash2,
  Undo2,
} from "lucide-react";

import { useT } from "@/i18n/client";
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

const ACTION =
  "flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-card hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * Rows of notifications; a click marks one read and follows its link. Hovering
 * a row (or focusing it; always on a touch screen) shows its actions: mark it
 * dealt with, or delete it.
 */
export function NotificationList({
  items,
  onOpen,
  onDone,
  onUndone,
  onDelete,
  dense,
}: {
  items: NotificationItem[];
  onOpen: (n: NotificationItem) => void;
  /** Mark as dealt with, without following the link. */
  onDone?: (n: NotificationItem) => void;
  /** Put back to "still to deal with". */
  onUndone?: (n: NotificationItem) => void;
  onDelete?: (n: NotificationItem) => void;
  dense?: boolean;
}) {
  const t = useT();
  const actions = Boolean(onDone || onDelete);
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
              <span
                className={cn(
                  "mt-2 h-2 w-2 shrink-0 rounded-full bg-[hsl(var(--destructive))]",
                  // The actions take its place while they show.
                  actions &&
                    "transition-opacity group-focus-within/row:opacity-0 group-hover/row:opacity-0 [@media(hover:none)]:hidden"
                )}
              />
            )}
          </>
        );
        const cls = cn(
          "flex w-full items-start gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors hover:bg-secondary group-focus-within/row:bg-secondary",
          // A touch screen has no hover: the actions always show, keep room for them.
          actions && "[@media(hover:none)]:pr-[4.75rem]"
        );
        return (
          <li key={n.id} className="group/row relative">
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
            {actions && (
              <div className="absolute right-2 top-2 flex items-center gap-0.5 rounded-full bg-secondary p-0.5 opacity-0 shadow-[0_0_0_6px_hsl(var(--secondary))] transition-opacity focus-within:opacity-100 group-hover/row:opacity-100 [@media(hover:none)]:bg-transparent [@media(hover:none)]:opacity-100 [@media(hover:none)]:shadow-none">
                {n.readAt
                  ? onUndone && (
                      <button
                        type="button"
                        className={ACTION}
                        onClick={() => onUndone(n)}
                        title={t("notifications.action.undone")}
                        aria-label={t("notifications.action.undoneAria", {
                          title: n.title,
                        })}
                      >
                        <Undo2 className="h-3.5 w-3.5" />
                      </button>
                    )
                  : onDone && (
                      <button
                        type="button"
                        className={ACTION}
                        onClick={() => onDone(n)}
                        title={t("notifications.action.done")}
                        aria-label={t("notifications.action.doneAria", {
                          title: n.title,
                        })}
                      >
                        <Check className="h-4 w-4" />
                      </button>
                    )}
                {onDelete && (
                  <button
                    type="button"
                    className={cn(
                      ACTION,
                      "hover:bg-negative hover:text-negative-foreground"
                    )}
                    onClick={() => onDelete(n)}
                    title={t("common.delete")}
                    aria-label={t("notifications.action.deleteAria", {
                      title: n.title,
                    })}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
