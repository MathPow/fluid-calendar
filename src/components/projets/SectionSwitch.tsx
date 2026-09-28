"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { FolderGit2, Users } from "lucide-react";

/** Projets ↔ Contacts: one section in the header, two pages. */
export function SectionSwitch() {
  const pathname = usePathname();
  const items = [
    { href: "/projets", label: "Projets", icon: FolderGit2 },
    { href: "/contacts", label: "Contacts", icon: Users },
  ];
  return (
    <div className="segmented">
      {items.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className="segmented-item"
          aria-current={
            pathname === href || pathname?.startsWith(href + "/") ? "page" : undefined
          }
        >
          <Icon className="h-4 w-4" />
          {label}
        </Link>
      ))}
    </div>
  );
}
