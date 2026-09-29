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

  const nav = (
    <>
      {MENU.map((link) => {
        const { href, label, icon: Icon } = link;
        return (
          <Link
            key={href}
            href={href}
            aria-current={isActive(link) ? "page" : undefined}
            className="segmented-item"
          >
            <Icon className="h-4 w-4 lg:hidden xl:block" strokeWidth={2} />
            <span>{label}</span>
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
          {nav}
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
        <div className="segmented shrink-0">{nav}</div>
      </nav>
    </header>
  );
}
