"use client";

import { Menu, Search } from "lucide-react";

import { cn } from "@/lib/utils";

import { StationSwitcher } from "./StationSwitcher";
import { ThemeToggle } from "./ThemeToggle";
import { UserMenu } from "./UserMenu";

interface TopbarProps {
  className?: string;
  onMenuClick?: () => void;
}

export function Topbar({ className, onMenuClick }: TopbarProps) {
  const openCommandPalette = () => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true })
    );
  };

  return (
    <header
      className={cn(
        "z-10 flex h-16 flex-none items-center gap-3 border-b border-border bg-background/80 px-3 backdrop-blur md:px-6",
        className
      )}
    >
      {/* Mobile menu */}
      <button
        type="button"
        onClick={onMenuClick}
        className="rounded-lg p-2 text-foreground hover:bg-muted md:hidden"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Search */}
      <button
        type="button"
        onClick={openCommandPalette}
        className="flex h-10 max-w-md flex-1 items-center gap-2 rounded-xl border border-border bg-muted/50 px-3.5 text-sm text-muted-foreground transition-colors hover:bg-muted"
        title="Search (⌘K)"
      >
        <Search className="h-4 w-4" />
        <span className="flex-1 text-left">Search anything…</span>
        <kbd className="hidden rounded bg-background px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground sm:inline">
          ⌘K
        </kbd>
      </button>

      <div className="ml-auto flex items-center gap-2 md:gap-3">
        <StationSwitcher />
        <ThemeToggle />
        <UserMenu />
      </div>
    </header>
  );
}
