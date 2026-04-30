"use client";

import { useState } from "react";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";

import { LogOut, Settings } from "lucide-react";
import { BsListTask, BsCalendar } from "react-icons/bs";
import { HiMenu, HiOutlineSearch, HiX } from "react-icons/hi";
import { RiKeyboardLine } from "react-icons/ri";

import { cn } from "@/lib/utils";

import { useShortcutsStore } from "@/store/shortcuts";

import { ThemeToggle } from "./ThemeToggle";
import { UserMenu } from "./UserMenu";

interface AppNavProps {
  className?: string;
}

export function AppNav({ className }: AppNavProps) {
  const pathname = usePathname();
  const { setOpen: setShortcutsOpen } = useShortcutsStore();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { data: session } = useSession();

  const handleLogout = () => signOut({ callbackUrl: "/auth/signin" });

  const openCommandPalette = () => {
    const event = new KeyboardEvent("keydown", {
      key: "k",
      metaKey: true,
      bubbles: true,
    });
    document.dispatchEvent(event);
  };

  const links = [
    { href: "/calendar", label: "Calendar", icon: BsCalendar },
    { href: "/tasks", label: "Tasks", icon: BsListTask },
  ];

  return (
    <>
      <nav
        className={cn(
          "z-10 h-16 flex-none border-b border-border bg-background",
          className
        )}
      >
        <div className="h-full px-4">
          <div className="flex h-full items-center justify-between">
            {/* Logo */}
            <Link href="/calendar" className="flex items-center">
              <Image src="/logo.svg" alt="FluidCalendar" width={28} height={28} />
            </Link>

            {/* Desktop links */}
            <div className="hidden items-center gap-6 md:flex ml-8">
              {links.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium",
                    pathname === href
                      ? "bg-primary/10 text-primary"
                      : "text-foreground hover:bg-muted"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </Link>
              ))}
            </div>

            {/* Desktop right actions */}
            <div className="hidden items-center gap-2 md:flex ml-auto">
              <button
                onClick={openCommandPalette}
                className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                title="Search (⌘K)"
              >
                <HiOutlineSearch className="h-4 w-4" />
                <span>Search</span>
                <kbd className="ml-1 rounded bg-muted px-1 py-0.5 text-xs">⌘K</kbd>
              </button>
              <ThemeToggle />
              <button
                onClick={() => setShortcutsOpen(true)}
                className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                title="Shortcuts (?)"
              >
                <RiKeyboardLine className="h-4 w-4" />
                <span>Shortcuts</span>
              </button>
              <UserMenu />
            </div>

            {/* Mobile: hamburger */}
            <button
              className="ml-auto rounded-lg p-2 text-foreground hover:bg-muted md:hidden"
              onClick={() => setMobileMenuOpen((o) => !o)}
              aria-label="Menu"
            >
              {mobileMenuOpen ? (
                <HiX className="h-6 w-6" />
              ) : (
                <HiMenu className="h-6 w-6" />
              )}
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile dropdown menu */}
      {mobileMenuOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-20 bg-black/40 md:hidden"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="fixed left-0 right-0 top-16 z-30 border-b border-border bg-background shadow-lg md:hidden">
            <div className="flex flex-col py-2">
              {links.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    "flex items-center gap-3 px-5 py-4 text-base font-medium",
                    pathname === href
                      ? "bg-primary/10 text-primary"
                      : "text-foreground hover:bg-muted"
                  )}
                >
                  <Icon className="h-5 w-5" />
                  {label}
                </Link>
              ))}

              <div className="mx-4 my-2 border-t border-border" />

              <button
                onClick={() => { openCommandPalette(); setMobileMenuOpen(false); }}
                className="flex items-center gap-3 px-5 py-4 text-base font-medium text-foreground hover:bg-muted"
              >
                <HiOutlineSearch className="h-5 w-5" />
                Search
              </button>
              <div className="flex items-center justify-between px-5 py-3">
                <span className="text-sm text-muted-foreground">Theme</span>
                <ThemeToggle />
              </div>

              <div className="mx-4 my-2 border-t border-border" />

              {session?.user?.email && (
                <div className="px-5 py-3 text-sm text-muted-foreground">
                  {session.user.email}
                </div>
              )}

              <Link
                href="/settings"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-3 px-5 py-4 text-base font-medium text-foreground hover:bg-muted"
              >
                <Settings className="h-5 w-5" />
                Settings
              </Link>

              <button
                onClick={handleLogout}
                className="flex w-full items-center gap-3 px-5 py-4 text-base font-medium text-destructive hover:bg-muted"
              >
                <LogOut className="h-5 w-5" />
                Log out
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
