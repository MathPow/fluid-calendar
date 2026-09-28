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
  Mic,
  Search,
  Target,
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
}

const MENU: NavLink[] = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboard },
  { href: "/calendar", label: "Calendar", icon: Calendar },
  { href: "/tasks", label: "Tasks", icon: ListTodo },
  { href: "/email", label: "Email", icon: Mail },
  { href: "/notes", label: "Notes", icon: FileText },
  { href: "/sessions", label: "Sessions", icon: Mic },
  { href: "/focus", label: "Focus", icon: Target },
  { href: "/projets", label: "Projets", icon: FolderGit2 },
  { href: "/contacts", label: "Contacts", icon: Users },
];

/**
 * Portal-style header: wordmark on the left, a segmented pill navigation in
 * the middle, and the account pill on the right. On phones the navigation
 * drops to a horizontally scrollable row under the header.
 */
export function AppHeader({ className }: { className?: string }) {
  const pathname = usePathname();

  const isActive = (href: string) =>
    pathname === href || pathname?.startsWith(href + "/");

  const openCommandPalette = () => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true })
    );
  };

  const nav = (
    <>
      {MENU.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          aria-current={isActive(href) ? "page" : undefined}
          className="segmented-item"
        >
          <Icon className="h-4 w-4 lg:hidden xl:block" strokeWidth={2} />
          <span>{label}</span>
        </Link>
      ))}
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
            className="flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-full bg-secondary px-3 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-border/70 hover:text-foreground 2xl:px-4"
            title="Search (⌘K)"
          >
            <Search className="h-4 w-4" />
            <span className="hidden 2xl:inline">Search anything…</span>
            <kbd className="hidden bg-card md:inline">⌘K</kbd>
          </button>

          <StationSwitcher className="hidden xl:inline-flex" compact />
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
