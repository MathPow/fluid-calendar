"use client";

import { useEffect, useState } from "react";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";

import { PwaInstallPrompt } from "@/components/PwaInstallPrompt";
import { AssistantWidget } from "@/components/assistant/AssistantWidget";
import { DndProvider } from "@/components/dnd/DndProvider";
import { AppHeader } from "@/components/navigation/AppHeader";
import { PrivacyProvider } from "@/components/providers/PrivacyProvider";
import { SessionProvider } from "@/components/providers/SessionProvider";
import { SetupCheck } from "@/components/setup/SetupCheck";
import { CommandPalette } from "@/components/ui/command-palette";
import { CommandPaletteFab } from "@/components/ui/command-palette-fab";
import { CommandPaletteHint } from "@/components/ui/command-palette-hint";
import { ShortcutsModal } from "@/components/ui/shortcuts-modal";
import { Toaster } from "@/components/ui/sonner";

import { usePageTitle } from "@/hooks/use-page-title";

import { useShortcutsStore } from "@/store/shortcuts";

import "../globals.css";

// Dynamically import the NotificationProvider based on SAAS flag
const NotificationProvider = dynamic<{ children: React.ReactNode }>(
  () =>
    import(
      `@/components/providers/NotificationProvider${
        process.env.NEXT_PUBLIC_ENABLE_SAAS_FEATURES === "true"
          ? ".saas"
          : ".open"
      }`
    ).then((mod) => mod.NotificationProvider),
  {
    ssr: false,
    loading: () => <>{/* Render nothing while loading */}</>,
  }
);

// "?" (Shift+6 on a Canadian-French layout) is a character people type in
// the chat bot, notes, search… — only treat it as a shortcut outside fields.
function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    !!target.closest("input, textarea, select, [contenteditable='true']")
  );
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const pathname = usePathname();
  // Sign-in, password reset and first-run setup are full-bleed pages that
  // carry their own wordmark — no app chrome there.
  const bare = pathname?.startsWith("/auth") || pathname === "/setup";
  const { isOpen: shortcutsOpen, setOpen: setShortcutsOpen } =
    useShortcutsStore();

  // Use the page title hook
  usePageTitle();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setCommandPaletteOpen((open) => !open);
      } else if (
        e.key === "?" &&
        !(e.metaKey || e.ctrlKey) &&
        !isTypingTarget(e.target)
      ) {
        e.preventDefault();
        setShortcutsOpen(true);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [setShortcutsOpen]);

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <SessionProvider>
        <PrivacyProvider>
          <DndProvider>
            <SetupCheck />
            <CommandPalette
              open={commandPaletteOpen}
              onOpenChange={setCommandPaletteOpen}
            />
            {!bare && <CommandPaletteHint />}
            {!bare && <CommandPaletteFab />}
            <ShortcutsModal
              isOpen={shortcutsOpen}
              onClose={() => setShortcutsOpen(false)}
            />

            {!bare && <AppHeader />}

            <main className="relative min-h-0 flex-1 overflow-auto max-md:pb-[env(safe-area-inset-bottom)]">
              <NotificationProvider>{children}</NotificationProvider>
            </main>

            {!bare && <AssistantWidget />}
            <PwaInstallPrompt />
            <Toaster />
          </DndProvider>
        </PrivacyProvider>
      </SessionProvider>
    </div>
  );
}
