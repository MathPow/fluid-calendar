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
import { ThemeToggle } from "./ThemeToggle";

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
 * Portal-style header: wordmark on the left, a segmented pill navigation in
 * the middle, and the account pill on the right. On phones the navigation
 * drops to a horizontally scrollable row under the header.
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

  // Desktop: icons only; the title slides out of the icon on hover (and stays
  // out on the current page). Phone: icon and title, side by side.
  const nav = (collapsible: boolean) => (
    <>
      {MENU.map((link) => {
        const { href, label, icon: Icon } = link;
        return (
          <Link
            key={href}
            href={href}
            aria-current={isActive(link) ? "page" : undefined}
            aria-label={collapsible ? label : undefined}
            title={collapsible ? label : undefined}
            className={cn("segmented-item", collapsible && "group gap-0 px-3")}
          >
            <Icon className="h-4 w-4 shrink-0" strokeWidth={2} />
            <span
              className={cn(
                collapsible &&
                  "max-w-0 overflow-hidden opacity-0 transition-[max-width,opacity,margin-left] duration-300 ease-out group-hover:ml-1.5 group-hover:max-w-[7rem] group-hover:opacity-100 group-focus-visible:ml-1.5 group-focus-visible:max-w-[7rem] group-focus-visible:opacity-100 group-aria-[current=page]:ml-1.5 group-aria-[current=page]:max-w-[7rem] group-aria-[current=page]:opacity-100 motion-reduce:transition-none"
              )}
            >
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
        {/* Wordmark */}
        <Link
          href="/dashboard"
          className="shrink-0 text-[22px] font-extrabold leading-none tracking-display text-foreground"
          aria-label="DreamDash home"
        >
          DreamDash
        </Link>

        {/* Desktop navigation */}
        <nav className="segmented ml-4 hidden lg:inline-flex" aria-label="Main">
          {nav(true)}
        </nav>

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          {/* Search pill */}
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
          <ThemeToggle />
          <AccountMenu />
        </div>
      </div>

      {/* Mobile navigation */}
      <nav
        className="page flex gap-1 overflow-x-auto pb-3 lg:hidden [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: "none" }}
        aria-label="Main"
      >
        <div className="segmented shrink-0">{nav(false)}</div>
      </nav>
    </header>
  );
}
