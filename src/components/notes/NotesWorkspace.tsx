"use client";

import { useEffect, useState } from "react";

import { AudioLines, FileText, Zap } from "lucide-react";

import { CommandsPanel } from "@/components/notes/CommandsPanel";
import { NotesExplorer } from "@/components/notes/NotesExplorer";
import { RecordingsPanel } from "@/components/notes/RecordingsPanel";
import { cn } from "@/lib/utils";

type Tab = "notes" | "recordings" | "commands";

/**
 * Notes tab shell with a sub-view switcher between the Obsidian vault notes,
 * synced audio Recordings, and the voice/text Commands log.
 */
export function NotesWorkspace() {
  const [tab, setTab] = useState<Tab>("notes");

  // Honor a deep link like /notes?tab=recordings (e.g. from the dashboard's
  // recent-changes feed). window.location avoids a useSearchParams Suspense
  // boundary that would otherwise force this route to bail out of prerender.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t === "recordings" || t === "commands") setTab(t);
  }, []);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 border-b border-border bg-card px-3 py-1.5">
        <TabButton
          active={tab === "notes"}
          onClick={() => setTab("notes")}
          icon={<FileText className="h-4 w-4" />}
          label="Notes"
        />
        <TabButton
          active={tab === "recordings"}
          onClick={() => setTab("recordings")}
          icon={<AudioLines className="h-4 w-4" />}
          label="Recordings"
        />
        <TabButton
          active={tab === "commands"}
          onClick={() => setTab("commands")}
          icon={<Zap className="h-4 w-4" />}
          label="Commands"
        />
      </div>
      <div className="min-h-0 flex-1">
        {tab === "notes" && <NotesExplorer />}
        {tab === "recordings" && <RecordingsPanel />}
        {tab === "commands" && <CommandsPanel />}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium",
        active
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
      )}
    >
      {icon}
      {label}
    </button>
  );
}
