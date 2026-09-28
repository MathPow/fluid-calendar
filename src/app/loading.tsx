"use client";

import { useEffect, useState } from "react";

import { usePathname } from "next/navigation";

import { getTitleFromPathname } from "@/lib/utils/page-title";

import "../app/globals.css";

export default function Loading() {
  // Use client-side rendering to avoid hydration issues
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setMounted(true);
    // Set document title on the client side
    const title = getTitleFromPathname(pathname);
    document.title = `Loading ${title}`;
  }, [pathname]);

  // Only render the full content after mounting on the client
  if (!mounted) {
    return null;
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4 text-center">
      <div className="mb-4 h-10 w-10 animate-spin rounded-full border-2 border-border border-t-foreground"></div>
      <p className="text-sm text-muted-foreground">Loading…</p>
    </div>
  );
}
