"use client";

import { useState } from "react";

import { AudioLines, FileText } from "lucide-react";

import { NotesExplorer } from "@/components/notes/NotesExplorer";
import { RecordingsPanel } from "@/components/notes/RecordingsPanel";
import { cn } from "@/lib/utils";

type Tab = "notes" | "recordings";

/**
 * Notes tab shell with a sub-view switcher between the Obsidian vault notes and
 * synced audio Recordings (from Meetily / Apple Watch).
 */
export function NotesWorkspace() {
  const [tab, setTab] = useState<Tab>("notes");

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
      </div>
      <div className="min-h-0 flex-1">
        {tab === "notes" ? <NotesExplorer /> : <RecordingsPanel />}
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
