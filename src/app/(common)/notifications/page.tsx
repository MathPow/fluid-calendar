"use client";

import { toast } from "sonner";

import { NotificationBell } from "@/components/notifications/NotificationBell";
import { NotificationList } from "@/components/notifications/NotificationList";
import { useNotifications } from "@/components/notifications/useNotifications";
import { Button } from "@/components/ui/button";

import { useT } from "@/i18n/client";

export default function NotificationsPage() {
  const t = useT();
  const { items, unread, loaded, markRead, markUnread, remove } =
    useNotifications();

  return (
    <div className="page py-5 md:py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-title md:text-4xl">
          {t("notifications.title")}
        </h1>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            disabled={!unread}
            onClick={() => markRead("all")}
          >
            {t("notifications.markAllRead")}
          </Button>
          <NotificationBell />
        </div>
      </div>
      <div className="mt-5 rounded-2xl bg-card p-2 shadow-tile md:p-4">
        {items.length ? (
          <NotificationList
            items={items}
            onOpen={(n) => {
              if (!n.readAt) void markRead([n.id]);
            }}
            onDone={(n) => {
              void markRead([n.id]);
            }}
            onUndone={(n) => {
              void markUnread([n.id]);
            }}
            onDelete={async (n) => {
              if (
                confirm(t("notifications.page.deleteConfirm")) &&
                !(await remove([n.id]))
              ) {
                toast.error(t("toasts.notifications.deleteFailed"));
              }
            }}
          />
        ) : (
          <p
            className="px-4 py-10 text-center text-sm text-muted-foreground"
            role="status"
          >
            {loaded
              ? t("notifications.emptyAll")
              : t("notifications.page.loading")}
          </p>
        )}
      </div>
    </div>
  );
}
