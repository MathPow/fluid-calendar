"use client";

import { useEffect, useState } from "react";

import Link from "next/link";

export default function NotFound() {
  // Use client-side rendering to avoid hydration issues
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Set document title on the client side
    document.title = "404 - Page Not Found";
  }, []);

  // Only render the full content after mounting on the client
  if (!mounted) {
    return null;
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4 text-center">
      <h1 className="display mb-4 text-[48px] md:text-[72px]">Nothing here.</h1>
      <p className="voice mb-8 max-w-md text-[20px] text-muted-foreground">
        The page you&apos;re looking for doesn&apos;t exist or has been
        moved.
      </p>
      <Link
        href="/"
        className="inline-flex h-11 items-center rounded-full bg-primary px-6 text-[15px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
      >
        Return Home
      </Link>
    </div>
  );
}
