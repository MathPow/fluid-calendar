"use client";

import { useEffect, useState } from "react";

import Link from "next/link";

import { useT } from "@/i18n";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useT();
  // Use client-side rendering to avoid hydration issues
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Set document title on the client side
    document.title = "Error - DreamDash";
    // Log the error to an error reporting service
    console.error(error);
  }, [error]);

  // Only render the full content after mounting on the client
  if (!mounted) {
    return null;
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4 text-center">
      <h1 className="display mb-4 text-[48px] md:text-[72px]">
        {t("error.title")}
      </h1>
      <p className="voice mb-8 text-[20px] text-muted-foreground">
        {t("error.description")}
      </p>
      <div className="flex space-x-4">
        <button
          onClick={reset}
          className="inline-flex h-11 items-center rounded-full bg-primary px-6 text-[15px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          {t("error.tryAgain")}
        </button>
        <Link
          href="/"
          className="inline-flex h-11 items-center rounded-full border-[1.5px] border-foreground px-6 text-[15px] font-semibold text-foreground transition-colors hover:bg-foreground hover:text-background"
        >
          {t("error.returnHome")}
        </Link>
      </div>
    </div>
  );
}
