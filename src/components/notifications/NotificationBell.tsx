"use client";

import { useEffect, useState } from "react";

import { Bell, BellRing } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

import { usePushNotifications } from "@/hooks/usePushNotifications";

import { NotificationList } from "./NotificationList";
import { useNotifications } from "./useNotifications";

/** iOS only delivers web push to the app added to the Home Screen. */
function useIosOutsideApp() {
  const [outside, setOutside] = useState(false);
  useEffect(() => {
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as { standalone?: boolean }).standalone === true;
    setOutside(ios && !standalone);
  }, []);
  return outside;
}

/** Header bell: unread count, the latest news, and turning on phone push. */
export function NotificationBell() {
  const { items, unread, markRead, markUnread, remove } = useNotifications();
  const push = usePushNotifications();
  const iosOutside = useIosOutsideApp();
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary text-foreground transition-colors hover:bg-border/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={
            unread ? `Notifications, ${unread} non lues` : "Notifications"
          }
          title="Notifications"
        >
          {unread ? (
            <BellRing className="h-[18px] w-[18px]" />
          ) : (
            <Bell className="h-[18px] w-[18px]" />
          )}
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[hsl(var(--destructive))] px-1 text-[10px] font-bold tabular-nums text-white">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[min(24rem,calc(100vw-1.5rem))] rounded-[20px] p-0"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="text-[15px] font-bold tracking-title">Notifications</p>
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
        <div className="max-h-[60vh] overflow-y-auto p-1.5">
          {items.length === 0 ? (
            <p className="px-4 py-10 text-center text-[13px] text-muted-foreground">
              Rien de neuf pour l&apos;instant.
            </p>
          ) : (
            <NotificationList
              items={items.slice(0, 20)}
              dense
              onOpen={(n) => {
                if (!n.readAt) markRead([n.id]);
                setOpen(false);
              }}
              onDone={(n) => markRead([n.id])}
              onUndone={(n) => markUnread([n.id])}
              onDelete={async (n) => {
                if (!(await remove([n.id])))
                  toast.error("Suppression impossible");
              }}
            />
          )}
        </div>
        {push.state !== "subscribed" && (
          <div className="border-t border-border px-4 py-3 text-[12px] text-muted-foreground">
            {iosOutside ? (
              <>
                Pour les recevoir sur l&apos;iPhone : Partager ▸ « Sur
                l&apos;écran d&apos;accueil », puis ouvre DreamDash depuis
                l&apos;icône et active-les ici.
              </>
            ) : push.state === "denied" ? (
              <>
                Les notifications sont bloquées pour ce site dans les réglages
                de l&apos;appareil.
              </>
            ) : push.state === "unsupported" ? (
              <>Cet appareil ne reçoit pas les notifications web.</>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <span>Recevoir les importantes sur cet appareil.</span>
                <Button
                  size="sm"
                  onClick={push.subscribe}
                  disabled={push.loading}
                >
                  Activer
                </Button>
              </div>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
