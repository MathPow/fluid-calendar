"use client";

import { useEffect, useState } from "react";

import { Search } from "lucide-react";

import { cn } from "@/lib/utils";

import { useT } from "@/i18n";

export function CommandPaletteFab() {
  const t = useT();
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      // Show the FAB when the user scrolls down more than 300px
      setIsVisible(window.scrollY > 300);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const openCommandPalette = () => {
    // Simulate Cmd+K / Ctrl+K
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true })
    );
  };

  return (
    <button
      onClick={openCommandPalette}
      className={cn(
        "fixed bottom-5 right-5 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-float",
        "hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
        "transition-all duration-300 ease-in-out",
        isVisible
          ? "translate-y-0 opacity-100"
          : "pointer-events-none translate-y-10 opacity-0"
      )}
      aria-label={t("commandPalette.fab.open")}
      title={t("commandPalette.fab.title")}
    >
      <Search className="h-5 w-5" />
    </button>
  );
}
