"use client";

import { useEffect, useRef, useState } from "react";

import Link from "next/link";
import { usePathname } from "next/navigation";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  Bell,
  Calendar,
  FileText,
  FolderGit2,
  LayoutDashboard,
  ListTodo,
  Mail,
  Menu as MenuIcon,
  Monitor,
  Receipt,
  Search,
  Settings,
  Users,
} from "lucide-react";

import { NotificationBell } from "@/components/notifications/NotificationBell";

import { cn } from "@/lib/utils";

import { AccountMenu } from "./AccountMenu";

interface NavLink {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  /** Other routes that live under this section (they keep it highlighted). */
  also?: string[];
}

// Eight sections. Focus lives under Tasks, Sessions under Notes and Machines
// under Contacts — each of those pages carries its own segmented switch.
const MENU: NavLink[] = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboard },
  { href: "/calendar", label: "Calendar", icon: Calendar },
  { href: "/tasks", label: "Tasks", icon: ListTodo, also: ["/focus"] },
  { href: "/email", label: "Email", icon: Mail },
  { href: "/notes", label: "Notes", icon: FileText, also: ["/sessions"] },
  { href: "/projets", label: "Projets", icon: FolderGit2 },
  { href: "/contacts", label: "Contacts", icon: Users, also: ["/machines"] },
  { href: "/fiscalite", label: "Fiscalité", icon: Receipt },
];

/**
 * Portal header. Top row is the wordmark, the nav, then search /
 * notifications / account (station lives in the account menu). The nav sits
 * right of the wordmark whenever it fits there whole, labels included; when
 * it doesn't, it drops under the top row rather than squishing. On phones
 * a compact header opens the navigation drawer.
 */
export function AppHeader({ className }: { className?: string }) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => setDrawerOpen(false), [pathname]);
  useEffect(() => {
    const query = window.matchMedia("(min-width: 768px)");
    const close = () => {
      if (query.matches) setDrawerOpen(false);
    };
    query.addEventListener("change", close);
    return () => query.removeEventListener("change", close);
  }, []);

  const isActive = (link: NavLink) =>
    [link.href, ...(link.also ?? [])].some(
      (p) => pathname === p || pathname?.startsWith(p + "/")
    );

  // Inline when the nav's natural width fits the gap between the wordmark and
  // the actions. The slot is flex-1 with a zero basis, so its width does not
  // depend on what it holds — no flip-flop.
  const slotRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLDivElement>(null);
  const [inline, setInline] = useState(false);
  useEffect(() => {
    const slot = slotRef.current;
    if (!slot) return;
    const check = () => {
      const nav = navRef.current;
      if (nav) setInline(nav.offsetWidth + 24 <= slot.clientWidth);
    };
    const ro = new ResizeObserver(check);
    ro.observe(slot);
    check();
    return () => ro.disconnect();
  }, [inline]);

  const links = (
    <div ref={navRef} className="segmented w-max shrink-0">
      {MENU.map((link) => {
        const { href, label, icon: Icon } = link;
        return (
          <Link
            key={href}
            href={href}
            aria-current={isActive(link) ? "page" : undefined}
            className="segmented-item h-10 px-3.5"
          >
            <Icon className="h-4 w-4 shrink-0" strokeWidth={2} />
            <span>{label}</span>
          </Link>
        );
      })}
    </div>
  );

  const openCommandPalette = () => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true })
    );
  };

  return (
    <header
      className={cn(
        "z-30 flex-none max-md:pt-[env(safe-area-inset-top)] border-b border-border/70 bg-background/85 backdrop-blur-md",
        className
      )}
    >
      <div className="page flex h-[52px] items-center gap-2 md:h-16 md:gap-3">
        <DialogPrimitive.Root open={drawerOpen} onOpenChange={setDrawerOpen}>
          <DialogPrimitive.Trigger asChild>
            <button
              type="button"
              aria-label="Ouvrir la navigation"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden"
            >
              <MenuIcon className="h-5 w-5" />
            </button>
          </DialogPrimitive.Trigger>
          <DialogPrimitive.Portal>
            <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 md:hidden" />
            <DialogPrimitive.Content
              className="fixed inset-y-0 left-0 z-50 flex w-[min(85vw,320px)] flex-col overflow-y-auto bg-card p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] shadow-float md:hidden"
              onTouchStart={(e) => {
                touchStart.current = null;
                if (e.touches.length !== 1) return;
                const t = e.touches[0];
                touchStart.current = { x: t.clientX, y: t.clientY };
              }}
              onTouchMove={(e) => {
                const start = touchStart.current;
                if (
                  e.touches.length !== 1 ||
                  (start && Math.abs(e.touches[0].clientY - start.y) > 50)
                )
                  touchStart.current = null;
              }}
              onTouchCancel={() => {
                touchStart.current = null;
              }}
              onTouchEnd={(e) => {
                const t = e.changedTouches[0];
                const start = touchStart.current;
                if (
                  start &&
                  start.x - t.clientX > 70 &&
                  Math.abs(start.y - t.clientY) < 50
                )
                  setDrawerOpen(false);
                touchStart.current = null;
              }}
            >
              <div className="mb-4 flex items-center justify-between">
                <DialogPrimitive.Title className="text-xl font-bold">
                  DreamDash
                </DialogPrimitive.Title>
                <DialogPrimitive.Close
                  className="h-10 rounded-full bg-secondary px-3"
                  aria-label="Fermer la navigation"
                >
                  Fermer
                </DialogPrimitive.Close>
              </div>
              <DialogPrimitive.Description className="sr-only">
                Navigation principale
              </DialogPrimitive.Description>
              <nav aria-label="Navigation mobile" className="space-y-1">
                {[
                  ...MENU.map((l) => ({
                    ...l,
                    label:
                      l.href === "/calendar"
                        ? "Calendrier"
                        : l.href === "/tasks"
                          ? "Tâches"
                          : l.label,
                  })),
                  { href: "/machines", label: "Machines", icon: Monitor },
                  {
                    href: "/notifications",
                    label: "Notifications",
                    icon: Bell,
                  },
                  { href: "/settings", label: "Paramètres", icon: Settings },
                ].map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setDrawerOpen(false)}
                    aria-current={
                      pathname === link.href ||
                      pathname?.startsWith(link.href + "/")
                        ? "page"
                        : undefined
                    }
                    className={cn(
                      "flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      pathname === link.href ||
                        pathname?.startsWith(link.href + "/")
                        ? "bg-tint-soft text-foreground"
                        : "hover:bg-secondary"
                    )}
                  >
                    <link.icon className="h-5 w-5" />
                    {link.label}
                  </Link>
                ))}
              </nav>
              <button
                type="button"
                className="mt-4 flex min-h-11 items-center gap-3 rounded-xl bg-secondary px-3"
                onClick={() => {
                  setDrawerOpen(false);
                  openCommandPalette();
                }}
              >
                <Search className="h-5 w-5" />
                Rechercher
              </button>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
        <Link
          href="/dashboard"
          className="flex min-h-10 shrink-0 items-center text-[19px] md:text-[22px] font-extrabold leading-none tracking-display text-foreground"
          aria-label="DreamDash home"
        >
          DreamDash
        </Link>

        <div
          ref={slotRef}
          className="hidden min-w-0 flex-1 basis-0 overflow-hidden pl-4 md:flex"
        >
          {inline && (
            <nav aria-label="Main" className="min-w-0">
              {links}
            </nav>
          )}
        </div>

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={openCommandPalette}
            className="hidden md:flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary text-foreground transition-colors hover:bg-border/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            title="Search anything (⌘K)"
            aria-label="Search anything"
          >
            <Search className="h-[18px] w-[18px]" />
          </button>

          <div className="hidden md:block">
            <NotificationBell />
          </div>
          <AccountMenu />
        </div>
      </div>

      {/* On tablet/desktop, move the navigation below when it cannot fit inline. */}
      {!inline && (
        <nav className="relative hidden md:block" aria-label="Main">
          <div className="page flex overflow-x-auto pb-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="mx-auto">{links}</div>
          </div>
          <div className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-background/85 to-transparent md:hidden" />
        </nav>
      )}
    </header>
  );
}
