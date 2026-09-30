"use client";

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
import { StationSwitcher } from "./StationSwitcher";

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
 * Portal-style header: wordmark on the left, a segmented pill navigation, and
 * the account pill on the right. Desktop shows icon + label side by side, no
 * hover animation. Phones drop the labels for the four sections that fit;
 * the whole strip is still swipeable across the eight sections.
 */
export function AppHeader({ className }: { className?: string }) {
  const pathname = usePathname();

  const isActive = (link: NavLink) =>
    [link.href, ...(link.also ?? [])].some(
      (p) => pathname === p || pathname?.startsWith(p + "/")
    );

  const openCommandPalette = () => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true })
    );
  };

  const nav = (
    <>
      {MENU.map((link) => {
        const { href, label, icon: Icon } = link;
        const active = isActive(link);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            aria-label={label}
            title={label}
            className="segmented-item h-10 px-3"
          >
            <Icon className="h-4 w-4 shrink-0" strokeWidth={2} />
            {/* Label hidden below md; the active item always shows it. */}
            <span className={cn("hidden md:inline", active && "!inline")}>
              {label}
            </span>
          </Link>
        );
      })}
    </>
  );

  return (
    <header
      className={cn(
        "z-30 flex-none border-b border-border/70 bg-background/85 backdrop-blur-md",
        className
      )}
    >
      <div className="page flex h-16 items-center gap-3 md:h-[72px]">
        <Link
          href="/dashboard"
          className="shrink-0 text-[22px] font-extrabold leading-none tracking-display text-foreground"
          aria-label="DreamDash home"
        >
          DreamDash
        </Link>

        {/* Desktop navigation — icon + label, no hover animation. */}
        <nav className="segmented ml-4 hidden lg:inline-flex" aria-label="Main">
          {nav}
        </nav>

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
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
          <StationSwitcher />
          <AccountMenu />
        </div>
      </div>

      {/* Phone / tablet navigation, swipeable across the eight sections. */}
      <nav
        className="relative flex lg:hidden"
        aria-label="Main"
      >
        <div
          className="page flex gap-1 overflow-x-auto pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <div className="segmented shrink-0">{nav}</div>
        </div>
        {/* Edge fade so the strip reads as scrollable. */}
        <div className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-background/85 to-transparent" />
      </nav>
    </header>
  );
}
