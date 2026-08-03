"use client";

import { useEffect, useMemo, useState } from "react";

import { useRouter } from "next/navigation";

import * as Dialog from "@radix-ui/react-dialog";
import { Command } from "cmdk";
import {
  ArrowLeft,
  AudioLines,
  Calendar,
  CalendarClock,
  CheckSquare,
  ClipboardList,
  FileText,
  FolderKanban,
  GitCommitHorizontal,
  LayoutGrid,
  Loader2,
  Search,
  Settings,
  Sparkles,
  X,
  Zap,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { cn, formatShortcut } from "@/lib/utils";

import { useCommands } from "@/hooks/useCommands";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface SearchResult {
  type: "task" | "event" | "note" | "recording";
  id: string;
  title: string;
  subtitle?: string;
  url: string;
}

/** A resource the AI answer was built from, as returned by /api/search/ask. */
interface AskSource {
  n: number;
  type: string;
  id: string;
  title: string;
  subtitle?: string;
  url: string;
  snippet: string;
  cited: boolean;
}

interface AskState {
  question: string;
  loading: boolean;
  answer: string | null;
  sources: AskSource[];
  error: string | null;
}

const RESULT_META: Record<
  SearchResult["type"],
  { label: string; icon: typeof CheckSquare }
> = {
  task: { label: "Tasks", icon: CheckSquare },
  event: { label: "Calendar", icon: CalendarClock },
  note: { label: "Notes", icon: FileText },
  recording: { label: "Recordings", icon: AudioLines },
};

/** Icons for every source type the ask endpoint can cite. */
const SOURCE_ICONS: Record<string, typeof CheckSquare> = {
  task: CheckSquare,
  event: CalendarClock,
  note: FileText,
  recording: AudioLines,
  project: FolderKanban,
  activity: GitCommitHorizontal,
};

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [showAllCommands, setShowAllCommands] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [ask, setAsk] = useState<AskState | null>(null);
  const { searchCommands, executeCommand, getAllCommands } = useCommands();

  // Hand the current query to the local LLM, which answers from the user's
  // tasks, events, notes, recordings, projects and agent activity.
  //
  // Two requests on purpose: retrieval returns in ~200ms but generation runs
  // for minutes on the CPU-only Ollama box, so the resources being consulted
  // are shown straight away instead of behind a long blank spinner.
  const runAsk = async (question: string) => {
    setAsk({ question, loading: true, answer: null, sources: [], error: null });

    const post = async (body: object) => {
      const res = await fetch("/api/search/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question, ...body }),
      });
      const data = (await res.json()) as {
        answer?: string;
        sources?: AskSource[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
      return data;
    };

    // Preview pass — best effort, a failure here just means no early list.
    post({ sourcesOnly: true })
      .then((preview) => {
        setAsk((prev) =>
          prev?.question === question && prev.loading
            ? { ...prev, sources: preview.sources ?? [] }
            : prev
        );
      })
      .catch(() => {});

    try {
      const data = await post({});
      setAsk({
        question,
        loading: false,
        answer: data.answer ?? "",
        sources: data.sources ?? [],
        error: null,
      });
    } catch (e) {
      setAsk((prev) => ({
        question,
        loading: false,
        answer: null,
        // Keep the previewed resources: they're still useful without an answer.
        sources: prev?.question === question ? prev.sources : [],
        error: e instanceof Error ? e.message : "Une erreur est survenue.",
      }));
    }
  };

  // Debounced content search across tasks / events / notes / recordings.
  useEffect(() => {
    const q = search.trim();
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
        });
        if (res.ok) {
          const data = await res.json();
          setResults(data.results ?? []);
        }
      } catch {
        // aborted or failed — keep prior results
      } finally {
        setSearching(false);
      }
    }, 200);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [search]);

  // Group content results by type, in the RESULT_META order.
  const groupedResults = useMemo(() => {
    const groups: Partial<Record<SearchResult["type"], SearchResult[]>> = {};
    for (const r of results) (groups[r.type] ??= []).push(r);
    return groups;
  }, [results]);

  const goTo = (url: string) => {
    router.push(url);
    onOpenChange(false);
  };

  // Get filtered commands based on search or show all commands
  const commands = useMemo(() => {
    if (showAllCommands) {
      return getAllCommands();
    }
    return search ? searchCommands(search) : [];
  }, [search, searchCommands, showAllCommands, getAllCommands]);

  // Reset search and showAllCommands when opening/closing
  useEffect(() => {
    if (!open) {
      setSearch("");
      setShowAllCommands(false);
      setResults([]);
      setAsk(null);
    }
  }, [open]);

  // Group commands by section for better organization
  const groupedCommands = useMemo(() => {
    const groups: Record<string, typeof commands> = {};

    commands.forEach((command) => {
      if (!groups[command.section]) {
        groups[command.section] = [];
      }
      groups[command.section].push(command);
    });

    return groups;
  }, [commands]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
        <Dialog.Content
          className="fixed left-1/2 top-[20%] z-50 w-full max-w-[640px] -translate-x-1/2"
          onEscapeKeyDown={(e) => {
            // In answer mode Esc backs out to the results list rather than
            // dismissing the palette and losing the question.
            if (ask) {
              e.preventDefault();
              setAsk(null);
            }
          }}
        >
          <Dialog.Title className="sr-only">Command Menu</Dialog.Title>
          <Dialog.Description className="sr-only">
            Search commands and navigate the application
          </Dialog.Description>

          {ask ? (
            <AskPanel
              state={ask}
              onBack={() => setAsk(null)}
              onRetry={() => runAsk(ask.question)}
              onNavigate={goTo}
            />
          ) : (
            <Command
              shouldFilter={false}
              className={cn(
                "overflow-hidden rounded-lg border bg-white shadow-lg",
                "transform transition-all",
                "data-[state=open]:animate-in data-[state=closed]:animate-out",
                "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
                "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
              )}
            >
              <div className="flex items-center border-b px-3">
                <Search className="h-5 w-5 text-gray-400" />
                <Command.Input
                  placeholder="Search, ask a question, or run a command"
                  className="h-12 flex-1 px-3 text-base outline-none placeholder:text-gray-400"
                  value={search}
                  onValueChange={setSearch}
                />
                {search && (
                  <button
                    className="text-gray-400 hover:text-gray-600"
                    onClick={() => setSearch("")}
                    aria-label="Clear search"
                  >
                    <X className="h-5 w-5" />
                  </button>
                )}
                {!search && (
                  <kbd className="hidden items-center gap-1 rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-400 sm:flex">
                    <span className="text-xs">⌘</span>
                    <span>K</span>
                  </kbd>
                )}
                <Dialog.Close
                  className="ml-2 p-2 text-gray-400 hover:text-gray-600"
                  aria-label="Close command menu"
                >
                  <X className="h-5 w-5" />
                </Dialog.Close>
              </div>

              <Command.List className="max-h-[300px] overflow-y-auto p-2">
                {/* Natural-language answer over everything, always offered first
                  so a question can be asked without matching any keyword. */}
                {search.trim().length >= 3 && (
                  <Command.Item
                    value="ask-ai"
                    className="mb-1 flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm aria-selected:bg-blue-50 aria-selected:text-blue-700"
                    onSelect={() => runAsk(search.trim())}
                  >
                    <Sparkles className="h-4 w-4 shrink-0 text-blue-500" />
                    <span className="truncate">
                      Ask AI:{" "}
                      <span className="font-medium">{search.trim()}</span>
                    </span>
                    <kbd className="ml-auto shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">
                      ↵
                    </kbd>
                  </Command.Item>
                )}

                {!search && !showAllCommands && (
                  <div className="px-2 py-3 text-sm text-gray-500">
                    <p className="mb-2">
                      Start typing to search commands or try these:
                    </p>
                    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <div
                        className="flex cursor-pointer items-center gap-2 rounded-md p-2 hover:bg-gray-100"
                        onClick={() => {
                          executeCommand("navigation.calendar");
                          onOpenChange(false);
                        }}
                      >
                        <Calendar className="h-4 w-4 text-gray-500" />
                        <span className="text-sm">Go to Calendar</span>
                        <kbd className="ml-auto rounded bg-gray-100 px-1.5 py-0.5 text-xs">
                          gc
                        </kbd>
                      </div>
                      <div
                        className="flex cursor-pointer items-center gap-2 rounded-md p-2 hover:bg-gray-100"
                        onClick={() => {
                          executeCommand("navigation.tasks");
                          onOpenChange(false);
                        }}
                      >
                        <ClipboardList className="h-4 w-4 text-gray-500" />
                        <span className="text-sm">Go to Tasks</span>
                        <kbd className="ml-auto rounded bg-gray-100 px-1.5 py-0.5 text-xs">
                          gt
                        </kbd>
                      </div>
                      <div
                        className="flex cursor-pointer items-center gap-2 rounded-md p-2 hover:bg-gray-100"
                        onClick={() => {
                          executeCommand("navigation.focus");
                          onOpenChange(false);
                        }}
                      >
                        <Zap className="h-4 w-4 text-gray-500" />
                        <span className="text-sm">Go to Focus</span>
                        <kbd className="ml-auto rounded bg-gray-100 px-1.5 py-0.5 text-xs">
                          gf
                        </kbd>
                      </div>
                      <div
                        className="flex cursor-pointer items-center gap-2 rounded-md p-2 hover:bg-gray-100"
                        onClick={() => {
                          executeCommand("navigation.settings");
                          onOpenChange(false);
                        }}
                      >
                        <Settings className="h-4 w-4 text-gray-500" />
                        <span className="text-sm">Go to Settings</span>
                        <kbd className="ml-auto rounded bg-gray-100 px-1.5 py-0.5 text-xs">
                          gs
                        </kbd>
                      </div>
                    </div>

                    <div className="mt-4 flex justify-center">
                      <button
                        onClick={() => setShowAllCommands(true)}
                        className="flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/10"
                      >
                        <LayoutGrid className="h-4 w-4" />
                        Show all commands
                      </button>
                    </div>
                  </div>
                )}

                {/* Content results: tasks, events, notes, recordings */}
                {(Object.keys(RESULT_META) as SearchResult["type"][]).map(
                  (type) => {
                    const items = groupedResults[type];
                    if (!items || items.length === 0) return null;
                    const { label, icon: Icon } = RESULT_META[type];
                    return (
                      <Command.Group key={`result-${type}`} heading={label}>
                        {items.map((item) => (
                          <Command.Item
                            key={`${item.type}:${item.id}`}
                            value={`${item.type}:${item.id}`}
                            className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm aria-selected:bg-blue-50 aria-selected:text-blue-700"
                            onSelect={() => goTo(item.url)}
                          >
                            <Icon className="h-4 w-4 shrink-0 text-gray-500" />
                            <span className="truncate">{item.title}</span>
                            {item.subtitle && (
                              <span className="ml-auto truncate pl-2 text-xs capitalize text-gray-400">
                                {item.subtitle}
                              </span>
                            )}
                          </Command.Item>
                        ))}
                      </Command.Group>
                    );
                  }
                )}

                {searching && results.length === 0 && (
                  <div className="flex items-center justify-center gap-2 py-6 text-sm text-gray-500">
                    <Loader2 className="h-4 w-4 animate-spin" /> Searching…
                  </div>
                )}

                {!searching && (
                  <Command.Empty className="py-6 text-center text-sm text-gray-500">
                    No results found. Try a different search term.
                  </Command.Empty>
                )}

                {(commands.length > 0 || showAllCommands) &&
                  Object.entries(groupedCommands).map(
                    ([section, sectionCommands]) => (
                      <Command.Group
                        key={section}
                        heading={
                          section.charAt(0).toUpperCase() + section.slice(1)
                        }
                      >
                        {sectionCommands.map((command) => {
                          const Icon = command.icon;
                          return (
                            <Command.Item
                              key={command.id}
                              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm aria-selected:bg-blue-50 aria-selected:text-blue-700"
                              onSelect={() => {
                                executeCommand(command.id);
                                onOpenChange(false);
                              }}
                            >
                              {Icon && <Icon className="h-4 w-4" />}
                              <span>{command.title}</span>
                              {command.shortcut && (
                                <kbd className="ml-auto text-xs text-gray-400">
                                  {formatShortcut(command.shortcut)}
                                </kbd>
                              )}
                            </Command.Item>
                          );
                        })}
                      </Command.Group>
                    )
                  )}
              </Command.List>
            </Command>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/**
 * Rewrite the model's `[3]` citation markers into markdown links pointing at
 * the matching resource. Angle-bracket destinations keep note paths containing
 * parentheses from breaking the link.
 */
function linkifyCitations(answer: string, sources: AskSource[]): string {
  const byNumber = new Map(sources.map((s) => [s.n, s]));
  return answer.replace(/\[(\d+)\]/g, (marker, digits) => {
    const source = byNumber.get(Number(digits));
    return source ? `[${marker}](<${source.url}>)` : marker;
  });
}

/** The AI answer view: question, grounded answer, and resources consulted. */
function AskPanel({
  state,
  onBack,
  onRetry,
  onNavigate,
}: {
  state: AskState;
  onBack: () => void;
  onRetry: () => void;
  onNavigate: (url: string) => void;
}) {
  // Cited sources first — they're the ones the answer actually leans on.
  const sources = [...state.sources].sort(
    (a, b) => Number(b.cited) - Number(a.cited) || a.n - b.n
  );

  return (
    <div className="overflow-hidden rounded-lg border bg-white shadow-lg">
      <div className="flex items-center gap-2 border-b px-3 py-2.5">
        <button
          onClick={onBack}
          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          aria-label="Back to search"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <Sparkles className="h-4 w-4 shrink-0 text-blue-500" />
        <span className="truncate text-sm font-medium text-gray-900">
          {state.question}
        </span>
        <Dialog.Close
          className="ml-auto p-1 text-gray-400 hover:text-gray-600"
          aria-label="Close command menu"
        >
          <X className="h-4 w-4" />
        </Dialog.Close>
      </div>

      <div className="max-h-[60vh] overflow-y-auto p-4">
        {state.loading && (
          <div className="flex items-start gap-2 py-2 text-sm text-gray-500">
            <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />
            <span>
              {state.sources.length === 0
                ? "Recherche dans ton calendrier, tes tâches, tes notes…"
                : "Lecture des ressources ci-dessous…"}
              <span className="block text-xs text-gray-400">
                Le modèle tourne en local — compte une à deux minutes.
              </span>
            </span>
          </div>
        )}

        {state.error && (
          <div className="py-2 text-sm">
            <p className="text-red-600">{state.error}</p>
            <button
              onClick={onRetry}
              className="mt-2 rounded-md px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50"
            >
              Réessayer
            </button>
          </div>
        )}

        {state.answer && (
          <div className="text-sm leading-7 text-gray-800 [&_li]:ml-5 [&_li]:list-disc [&_p]:mb-2 [&_strong]:font-semibold">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                a: ({ href, children }) => (
                  <button
                    type="button"
                    onClick={() => href && onNavigate(href)}
                    className="mx-0.5 rounded bg-blue-50 px-1 align-baseline text-xs font-medium text-blue-600 hover:bg-blue-100"
                  >
                    {children}
                  </button>
                ),
              }}
            >
              {linkifyCitations(state.answer, state.sources)}
            </ReactMarkdown>
          </div>
        )}

        {sources.length > 0 && (
          <div className="mt-4 border-t pt-3">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">
              Ressources consultées
            </p>
            <ul className="space-y-0.5">
              {sources.map((source) => {
                const Icon = SOURCE_ICONS[source.type] ?? FileText;
                return (
                  <li key={`${source.type}:${source.id}`}>
                    <button
                      type="button"
                      onClick={() => onNavigate(source.url)}
                      title={source.snippet}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-gray-100"
                    >
                      <span
                        className={cn(
                          "w-6 shrink-0 text-xs tabular-nums",
                          source.cited
                            ? "font-semibold text-blue-600"
                            : "text-gray-400"
                        )}
                      >
                        [{source.n}]
                      </span>
                      <Icon className="h-4 w-4 shrink-0 text-gray-500" />
                      <span className="truncate text-gray-800">
                        {source.title}
                      </span>
                      {source.subtitle && (
                        <span className="ml-auto truncate pl-2 text-xs text-gray-400">
                          {source.subtitle}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
