"use client";

import { useEffect, useState } from "react";

import { Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";

export function CommandPaletteHint() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Check if the user has seen the hint before
    const hasSeenHint = localStorage.getItem("hasSeenCommandPaletteHint");

    if (!hasSeenHint) {
      // Show the hint after a short delay
      const timer = setTimeout(() => {
        setIsVisible(true);
      }, 2000);

      return () => clearTimeout(timer);
    }
  }, []);

  const dismissHint = () => {
    setIsVisible(false);
    // Mark that the user has seen the hint
    localStorage.setItem("hasSeenCommandPaletteHint", "true");
  };

  // Trigger command palette
  const openCommandPalette = () => {
    dismissHint();
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true })
    );
  };

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 duration-300 animate-in fade-in slide-in-from-bottom-4">
      <div className="max-w-xs rounded-[24px] bg-card p-5 shadow-float">
        <div className="mb-2 flex items-start justify-between">
          <p className="etiquette flex items-center gap-2 pt-1">
            <Search className="h-3.5 w-3.5" />
            Quick tip
          </p>
          <button
            onClick={dismissHint}
            className="-mr-1 -mt-1 rounded-full p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
            aria-label="Dismiss hint"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="voice mb-4 text-[19px] text-foreground">
          Press <kbd>⌘K</kbd> to search or run anything.
        </p>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={dismissHint}>
            Dismiss
          </Button>
          <Button size="sm" onClick={openCommandPalette}>
            Try it now
          </Button>
        </div>
      </div>
    </div>
  );
}
