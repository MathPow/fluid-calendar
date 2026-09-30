"use client";

import { useEffect, useRef, useState } from "react";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  Calendar,
  FileText,
  FolderGit2,
  LayoutDashboard,
  ListTodo,
  Mail,
  Receipt,
  Search,
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
 * it's a swipeable strip that keeps every label so you find items by name.
 */
export function AppHeader({ className }: { className?: string }) {
  const pathname = usePathname();

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
        "z-30 flex-none border-b border-border/70 bg-background/85 backdrop-blur-md",
        className
      )}
    >
      <div className="page flex h-16 items-center gap-3">
        <Link
          href="/dashboard"
          className="shrink-0 text-[22px] font-extrabold leading-none tracking-display text-foreground"
          aria-label="DreamDash home"
        >
          DreamDash
        </Link>

        <div
          ref={slotRef}
          className="flex min-w-0 flex-1 basis-0 overflow-hidden pl-4"
        >
          {inline && (
            <nav aria-label="Main" className="min-w-0">
              {links}
            </nav>
          )}
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={openCommandPalette}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary text-foreground transition-colors hover:bg-border/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            title="Search anything (⌘K)"
            aria-label="Search anything"
          >
            <Search className="h-[18px] w-[18px]" />
          </button>

          <NotificationBell />
          <AccountMenu />
        </div>
      </div>

      {/* No room beside the wordmark: under the top row. Swipeable on
          phones (edge fade hints at it), centered on a desktop. */}
      {!inline && (
        <nav className="relative" aria-label="Main">
          <div className="page flex overflow-x-auto pb-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="mx-auto">{links}</div>
          </div>
          <div className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-background/85 to-transparent md:hidden" />
        </nav>
      )}
    </header>
  );
}
