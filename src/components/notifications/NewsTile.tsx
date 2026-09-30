"use client";

import { useState } from "react";

import { toast } from "sonner";

import { NotificationList } from "./NotificationList";
import { useNotifications } from "./useNotifications";

const PREVIEW = 5;

/**
 * Dashboard « Nouvelles »: the latest notifications, unread first. `embedded`
 * fills a bento cell (scrolls inside it) and says so when there is nothing.
 */
export function NewsTile({
  embedded = false,
  unreadOnly = false,
}: {
  embedded?: boolean;
  unreadOnly?: boolean;
}) {
  const {
    items: all_,
    unread,
    loaded,
    markRead,
    markUnread,
    remove,
  } = useNotifications();
  const items = unreadOnly ? all_.filter((n) => !n.readAt) : all_;
  const [all, setAll] = useState(false);
  if (!embedded && (!loaded || items.length === 0)) return null;

  const sorted = [...items].sort(
    (a, b) =>
      Number(!!a.readAt) - Number(!!b.readAt) ||
      b.createdAt.localeCompare(a.createdAt)
  );
  const shown = all || embedded ? sorted : sorted.slice(0, PREVIEW);

  return (
    <section
      className={
        embedded ? "flex h-full min-h-0 flex-col" : "tile mt-5 p-6 md:p-8"
      }
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <p className="etiquette">Nouvelles</p>
          {unread > 0 && (
            <span className="text-[12px] font-semibold text-[hsl(var(--destructive))]">
              {unread} non lue{unread > 1 ? "s" : ""}
            </span>
          )}
        </div>
        {unread > 0 && (
          <button
            type="button"
            onClick={() => markRead("all")}
            className="text-[12px] font-medium text-muted-foreground hover:text-foreground"
          >
            Tout marquer lu
          </button>
        )}
      </div>
      {embedded && loaded && items.length === 0 && (
        <p className="flex flex-1 items-center justify-center py-6 text-[13px] text-muted-foreground">
          {unreadOnly ? "Tout est lu." : "Rien de neuf."}
        </p>
      )}
      <div
        className={
          embedded
            ? "-mx-2.5 mt-2 min-h-0 flex-1 overflow-y-auto"
            : "-mx-2.5 mt-2"
        }
      >
        <NotificationList
          items={shown}
          onOpen={(n) => !n.readAt && markRead([n.id])}
          onDone={(n) => markRead([n.id])}
          onUndone={(n) => markUnread([n.id])}
          onDelete={async (n) => {
            if (!(await remove([n.id]))) toast.error("Suppression impossible");
          }}
        />
      </div>
      {!embedded && sorted.length > PREVIEW && (
        <button
          type="button"
          onClick={() => setAll((v) => !v)}
          className="mt-1 text-[12px] font-medium text-muted-foreground hover:text-foreground"
        >
          {all ? "Réduire" : `Voir les ${sorted.length - PREVIEW} autres`}
        </button>
      )}
    </section>
  );
}
