"use client";

import { useState } from "react";

import { signOut, useSession } from "next-auth/react";
import Link from "next/link";

import { ChevronDown, HelpCircle, LogOut, Settings } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { useShortcutsStore } from "@/store/shortcuts";

import { StationSwitcher } from "./StationSwitcher";

/**
 * The account pill (avatar · name · chevron) and its menu, modelled on the
 * portal's "Menu compte".
 */
export function AccountMenu() {
  const { data: session, status } = useSession();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const { setOpen: setShortcutsOpen } = useShortcutsStore();

  // The app is reachable only over the tailnet and guards pages with its own
  // session, so there is no sign-in button here; /auth/signin handles it.
  if (status !== "authenticated" || !session) return null;

  const name = session.user?.name?.trim() || "You";
  const initials = name
    .split(/\s+/)
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    await signOut({ callbackUrl: "/auth/signin" });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex h-11 shrink-0 items-center gap-2 rounded-full bg-card p-1 text-[14px] font-medium text-foreground shadow-tile transition-shadow hover:shadow-float focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:pr-3"
          aria-label="Account menu"
        >
          <Avatar className="h-8 w-8">
            <AvatarImage src={session.user?.image || ""} alt={name} />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <span className="hidden max-w-[9rem] truncate lg:inline">
            {name}
          </span>
          <ChevronDown className="hidden h-4 w-4 text-muted-foreground lg:block" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent className="w-72 p-3" align="end" sideOffset={10}>
        <p className="etiquette px-2 pb-2 pt-1">Signed in as</p>
        <div className="rounded-chip bg-tint-soft px-3 py-2.5">
          <p className="truncate text-[15px] font-semibold tracking-title">
            {name}
          </p>
          {session.user?.email && (
            <p className="truncate text-[13px] text-muted-foreground">
              {session.user.email}
            </p>
          )}
        </div>

        <div className="mt-3 xl:hidden">
          <p className="etiquette px-2 pb-2">Station</p>
          <StationSwitcher className="w-full" />
        </div>

        <DropdownMenuSeparator className="my-3" />

        <DropdownMenuItem asChild>
          <Link href="/settings" className="cursor-pointer">
            <Settings />
            <span>Settings</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem
          className="cursor-pointer"
          onSelect={() => setShortcutsOpen(true)}
        >
          <HelpCircle />
          <span>Keyboard shortcuts</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          className="cursor-pointer text-muted-foreground"
          onClick={handleLogout}
          disabled={isLoggingOut}
        >
          <LogOut />
          <span>{isLoggingOut ? "Logging out…" : "Log out"}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
