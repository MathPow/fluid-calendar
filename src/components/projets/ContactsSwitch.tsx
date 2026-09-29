"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Server, Users } from "lucide-react";

/** Contacts ↔ Machines: one section in the header, two pages. */
export function ContactsSwitch() {
  const pathname = usePathname();
  const items = [
    { href: "/contacts", label: "Contacts", icon: Users },
    { href: "/machines", label: "Machines", icon: Server },
  ];
  return (
    <div className="segmented">
      {items.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className="segmented-item"
          aria-current={
            pathname === href || pathname?.startsWith(href + "/")
              ? "page"
              : undefined
          }
        >
          <Icon className="h-4 w-4" />
          {label}
        </Link>
      ))}
    </div>
  );
}
