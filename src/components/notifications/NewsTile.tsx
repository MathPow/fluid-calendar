"use client";

import { useState } from "react";

import { NotificationList } from "./NotificationList";
import { useNotifications } from "./useNotifications";

const PREVIEW = 5;

/** Dashboard « Nouvelles »: the latest notifications, unread first. */
export function NewsTile() {
  const { items, unread, loaded, markRead } = useNotifications();
  const [all, setAll] = useState(false);
  if (!loaded || items.length === 0) return null;

  const sorted = [...items].sort(
    (a, b) =>
      Number(!!a.readAt) - Number(!!b.readAt) ||
      b.createdAt.localeCompare(a.createdAt)
  );
  const shown = all ? sorted : sorted.slice(0, PREVIEW);

  return (
    <section className="tile mt-5 p-6 md:p-8">
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
      <div className="-mx-2.5 mt-2">
        <NotificationList
          items={shown}
          onOpen={(n) => !n.readAt && markRead([n.id])}
        />
      </div>
      {sorted.length > PREVIEW && (
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
