"use client";

import { useEffect, useState } from "react";

import { useRouter } from "next/navigation";

import { Kanban, ListTodo, Target } from "lucide-react";

import { ActionOverlay } from "@/components/ui/action-overlay";

import { useFocusModeStore } from "@/store/focusMode";
import { useTaskPageSettings } from "@/store/taskPageSettings";

import { FocusedTask } from "./FocusedTask";
import { QuickActions } from "./QuickActions";
import { TaskQueue } from "./TaskQueue";

export function FocusMode() {
  const [mounted, setMounted] = useState(false);
  const router = useRouter();
  const { setViewMode } = useTaskPageSettings();
  const goToTasks = (mode: "list" | "board") => {
    setViewMode(mode);
    router.push("/tasks");
  };

  // Add hydration safety
  const {
    getCurrentTask,
    isProcessing,
    actionType,
    actionMessage,
    stopProcessing,
  } = useFocusModeStore();

  // Get current task and queued tasks - do this before any conditional returns
  const currentTask = getCurrentTask();

  // This effect will only run on the client
  useEffect(() => {
    setMounted(true);
  }, []);

  // If not mounted yet, render a simple loading state
  if (!mounted) {
    return (
      <div className="flex h-full flex-col items-center justify-center">
        <p className="text-lg text-muted-foreground">Loading focus mode...</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-none items-center justify-between gap-4 border-b border-border px-4 pb-4 pt-5 md:px-8 md:pb-5 md:pt-7">
        <h1 className="display text-[32px] md:text-[40px]">Focus.</h1>
        <div className="segmented">
          <button type="button" className="segmented-item" onClick={() => goToTasks("list")}>
            <ListTodo className="h-4 w-4" />
            List
          </button>
          <button type="button" className="segmented-item" onClick={() => goToTasks("board")}>
            <Kanban className="h-4 w-4" />
            Board
          </button>
          <span className="segmented-item" data-active="true">
            <Target className="h-4 w-4" />
            Focus
          </span>
        </div>
      </div>
      {isProcessing && actionType && (
        <ActionOverlay
          type={actionType}
          message={actionMessage || undefined}
          onComplete={stopProcessing}
        />
      )}

      <div className="flex min-h-0 flex-1">
        {/* Left sidebar with queued tasks */}
        <aside className="h-full w-80 border-r border-border bg-card">
          <TaskQueue />
        </aside>

        {/* Main content area */}
        <main className="flex-1 overflow-y-auto p-8">
          <FocusedTask task={currentTask} />
        </main>

        {/* Right sidebar with quick actions */}
        <aside className="h-full w-64 border-l border-border bg-card">
          <QuickActions />
        </aside>
      </div>
    </div>
  );
}
