"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";

import {
  Calendar,
  FileText,
  FolderGit2,
  HelpCircle,
  LayoutDashboard,
  ListTodo,
  LogOut,
  Mail,
  Settings,
  Target,
} from "lucide-react";

import { cn } from "@/lib/utils";

import { useShortcutsStore } from "@/store/shortcuts";

interface NavLink {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
}

const MENU: NavLink[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/calendar", label: "Calendar", icon: Calendar },
  { href: "/tasks", label: "Tasks", icon: ListTodo },
  { href: "/email", label: "Email", icon: Mail },
  { href: "/notes", label: "Notes", icon: FileText },
  { href: "/focus", label: "Focus", icon: Target },
  { href: "/projets", label: "Projets", icon: FolderGit2 },
];

interface SidebarProps {
  className?: string;
  onNavigate?: () => void;
}

export function Sidebar({ className, onNavigate }: SidebarProps) {
  const pathname = usePathname();
  const { setOpen: setShortcutsOpen } = useShortcutsStore();

  const isActive = (href: string) =>
    pathname === href || pathname?.startsWith(href + "/");

  const renderLink = ({ href, label, icon: Icon }: NavLink) => (
    <Link
      key={href}
      href={href}
      onClick={onNavigate}
      className={cn(
        "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
        isActive(href)
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
      )}
    >
      <Icon className="h-[18px] w-[18px]" />
      {label}
    </Link>
  );

  return (
    <aside
      className={cn(
        "flex h-full w-64 flex-col border-r border-border bg-card",
        className
      )}
    >
      {/* Brand */}
      <Link
        href="/dashboard"
        onClick={onNavigate}
        className="flex items-center gap-2.5 px-5 py-5"
      >
        {/* unoptimized: Next's image optimizer rejects SVGs by default (400). */}
        <Image
          src="/logo.svg"
          alt="DreamDash"
          width={28}
          height={28}
          unoptimized
        />
        <span className="text-lg font-semibold tracking-tight">
          Dream<span className="text-primary">Dash</span>
        </span>
      </Link>

      {/* Nav */}
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-2">
        <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
          Menu
        </p>
        {MENU.map(renderLink)}

        {/* General pinned to the bottom of the sidebar. */}
        <div className="mt-auto flex flex-col gap-1 pt-4">
          <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            General
          </p>
          {renderLink({ href: "/settings", label: "Settings", icon: Settings })}
          <button
            type="button"
            onClick={() => {
              setShortcutsOpen(true);
              onNavigate?.();
            }}
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <HelpCircle className="h-[18px] w-[18px]" />
            Shortcuts
          </button>
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/auth/signin" })}
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          >
            <LogOut className="h-[18px] w-[18px]" />
            Log out
          </button>
        </div>
      </nav>
    </aside>
  );
}
