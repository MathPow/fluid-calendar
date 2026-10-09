"use client";

import { useEffect, useMemo, useState } from "react";

import { useRouter } from "next/navigation";

import * as Dialog from "@radix-ui/react-dialog";
import { Command } from "cmdk";
import {
  ArrowLeft,
  AudioLines,
  Building2,
  Calendar,
  CalendarClock,
  CheckSquare,
  ClipboardList,
  FileText,
  FolderKanban,
  Ghost,
  GitCommitHorizontal,
  LayoutGrid,
  Loader2,
  Receipt,
  Search,
  Server,
  Settings,
  Sparkles,
  Users,
  X,
  Zap,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { cn, formatShortcut } from "@/lib/utils";

import { useCommands } from "@/hooks/useCommands";
import { useT } from "@/i18n";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface SearchResult {
  type:
    | "project"
    | "contact"
    | "organisation"
    | "task"
    | "event"
    | "invoice"
    | "note"
    | "recording"
    | "machine"
    | "ghost";
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
  { labelKey: string; icon: typeof CheckSquare }
> = {
  project: { labelKey: "commandPalette.result.project", icon: FolderKanban },
  contact: { labelKey: "commandPalette.result.contact", icon: Users },
  organisation: {
    labelKey: "commandPalette.result.organisation",
    icon: Building2,
  },
  task: { labelKey: "commandPalette.result.task", icon: CheckSquare },
  event: { labelKey: "commandPalette.result.event", icon: CalendarClock },
  invoice: { labelKey: "commandPalette.result.invoice", icon: Receipt },
  note: { labelKey: "commandPalette.result.note", icon: FileText },
  recording: { labelKey: "commandPalette.result.recording", icon: AudioLines },
  machine: { labelKey: "commandPalette.result.machine", icon: Server },
  ghost: { labelKey: "commandPalette.result.ghost", icon: Ghost },
};

/** Icons for every source type the ask endpoint can cite. */
const SOURCE_ICONS: Record<string, typeof CheckSquare> = {
  task: CheckSquare,
  event: CalendarClock,
  note: FileText,
  recording: AudioLines,
  project: FolderKanban,
  activity: GitCommitHorizontal,
  machine: Server,
};

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const t = useT();
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
        error: e instanceof Error ? e.message : t("commandPalette.ask.genericError"),
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
          <Dialog.Title className="sr-only">
            {t("commandPalette.title")}
          </Dialog.Title>
          <Dialog.Description className="sr-only">
            {t("commandPalette.description")}
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
                "overflow-hidden rounded-[24px] bg-card shadow-float",
                "transform transition-all",
                "data-[state=open]:animate-in data-[state=closed]:animate-out",
                "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
                "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
              )}
            >
              <div className="flex items-center border-b border-border px-4">
                <Search className="h-5 w-5 text-muted-foreground" />
                <Command.Input
                  placeholder={t("commandPalette.searchPlaceholder")}
                  className="h-12 flex-1 px-3 text-base outline-none placeholder:text-muted-foreground"
                  value={search}
                  onValueChange={setSearch}
                />
                {/* One ×: it clears the text first, then closes (Esc does too). */}
                {search ? (
                  <button
                    className="ml-2 p-2 text-muted-foreground hover:text-foreground"
                    onClick={() => setSearch("")}
                    aria-label={t("commandPalette.clearSearch")}
                  >
                    <X className="h-5 w-5" />
                  </button>
                ) : (
                  <>
                    <kbd className="hidden items-center gap-1 rounded bg-secondary px-2 py-0.5 text-xs text-muted-foreground sm:flex">
                      <span className="text-xs">⌘</span>
                      <span>K</span>
                    </kbd>
                    <Dialog.Close
                      className="ml-2 p-2 text-muted-foreground hover:text-foreground"
                      aria-label={t("commandPalette.close")}
                    >
                      <X className="h-5 w-5" />
                    </Dialog.Close>
                  </>
                )}
              </div>

              <Command.List className="max-h-[300px] overflow-y-auto p-2">
                {/* Natural-language answer over everything, always offered first
                  so a question can be asked without matching any keyword. */}
                {search.trim().length >= 3 && (
                  <Command.Item
                    value="ask-ai"
                    className="mb-1 flex cursor-pointer items-center gap-2 rounded-xl px-2 py-2 text-sm aria-selected:bg-tint-soft aria-selected:text-foreground"
                    onSelect={() => runAsk(search.trim())}
                  >
                    <Sparkles className="h-4 w-4 shrink-0 text-foreground" />
                    <span className="truncate">
                      {t("commandPalette.askAi")}{" "}
                      <span className="font-medium">{search.trim()}</span>
                    </span>
                    <kbd className="ml-auto shrink-0 rounded bg-secondary px-1.5 py-0.5 text-xs text-muted-foreground">
                      ↵
                    </kbd>
                  </Command.Item>
                )}

                {!search && !showAllCommands && (
                  <div className="px-2 py-3 text-sm text-muted-foreground">
                    <p className="mb-2">{t("commandPalette.startTyping")}</p>
                    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <div
                        className="flex cursor-pointer items-center gap-2 rounded-xl p-2 hover:bg-secondary"
                        onClick={() => {
                          executeCommand("navigation.calendar");
                          onOpenChange(false);
                        }}
                      >
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">
                          {t("commandPalette.goTo.calendar")}
                        </span>
                        <kbd className="ml-auto rounded bg-secondary px-1.5 py-0.5 text-xs">
                          gc
                        </kbd>
                      </div>
                      <div
                        className="flex cursor-pointer items-center gap-2 rounded-xl p-2 hover:bg-secondary"
                        onClick={() => {
                          executeCommand("navigation.tasks");
                          onOpenChange(false);
                        }}
                      >
                        <ClipboardList className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">
                          {t("commandPalette.goTo.tasks")}
                        </span>
                        <kbd className="ml-auto rounded bg-secondary px-1.5 py-0.5 text-xs">
                          gt
                        </kbd>
                      </div>
                      <div
                        className="flex cursor-pointer items-center gap-2 rounded-xl p-2 hover:bg-secondary"
                        onClick={() => {
                          executeCommand("navigation.focus");
                          onOpenChange(false);
                        }}
                      >
                        <Zap className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">
                          {t("commandPalette.goTo.focus")}
                        </span>
                        <kbd className="ml-auto rounded bg-secondary px-1.5 py-0.5 text-xs">
                          gf
                        </kbd>
                      </div>
                      <div
                        className="flex cursor-pointer items-center gap-2 rounded-xl p-2 hover:bg-secondary"
                        onClick={() => {
                          executeCommand("navigation.settings");
                          onOpenChange(false);
                        }}
                      >
                        <Settings className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">
                          {t("commandPalette.goTo.settings")}
                        </span>
                        <kbd className="ml-auto rounded bg-secondary px-1.5 py-0.5 text-xs">
                          gs
                        </kbd>
                      </div>
                    </div>

                    <div className="mt-4 flex justify-center">
                      <button
                        onClick={() => setShowAllCommands(true)}
                        className="flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/10"
                      >
                        <LayoutGrid className="h-4 w-4" />
                        {t("commandPalette.showAll")}
                      </button>
                    </div>
                  </div>
                )}

                {/* Content results: tasks, events, notes, recordings */}
                {(Object.keys(RESULT_META) as SearchResult["type"][]).map(
                  (type) => {
                    const items = groupedResults[type];
                    if (!items || items.length === 0) return null;
                    const { labelKey, icon: Icon } = RESULT_META[type];
                    return (
                      <Command.Group
                        key={`result-${type}`}
                        heading={t(labelKey)}
                      >
                        {items.map((item) => (
                          <Command.Item
                            key={`${item.type}:${item.id}`}
                            value={`${item.type}:${item.id}`}
                            className="flex cursor-pointer items-center gap-2 rounded-xl px-2 py-2 text-sm aria-selected:bg-tint-soft aria-selected:text-foreground"
                            onSelect={() => goTo(item.url)}
                          >
                            <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <span className="truncate">{item.title}</span>
                            {item.subtitle && (
                              <span className="ml-auto truncate pl-2 text-xs capitalize text-muted-foreground">
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
                  <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />{" "}
                    {t("commandPalette.searching")}
                  </div>
                )}

                {!searching && (
                  <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
                    {t("commandPalette.noResults")}
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
                              className="flex cursor-pointer items-center gap-2 rounded-xl px-2 py-2 text-sm aria-selected:bg-tint-soft aria-selected:text-foreground"
                              onSelect={() => {
                                executeCommand(command.id);
                                onOpenChange(false);
                              }}
                            >
                              {Icon && <Icon className="h-4 w-4" />}
                              <span>{command.title}</span>
                              {command.shortcut && (
                                <kbd className="ml-auto text-xs text-muted-foreground">
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
  const t = useT();
  // Cited sources first — they're the ones the answer actually leans on.
  const sources = [...state.sources].sort(
    (a, b) => Number(b.cited) - Number(a.cited) || a.n - b.n
  );

  return (
    <div className="overflow-hidden rounded-[24px] bg-card shadow-float">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <button
          onClick={onBack}
          className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
          aria-label={t("commandPalette.back")}
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <Sparkles className="h-4 w-4 shrink-0 text-foreground" />
        <span className="truncate text-sm font-medium text-foreground">
          {state.question}
        </span>
        <Dialog.Close
          className="ml-auto p-1 text-muted-foreground hover:text-foreground"
          aria-label={t("commandPalette.close")}
        >
          <X className="h-4 w-4" />
        </Dialog.Close>
      </div>

      <div className="max-h-[60vh] overflow-y-auto p-4">
        {state.loading && (
          <div className="flex items-start gap-2 py-2 text-sm text-muted-foreground">
            <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />
            <span>
              {state.sources.length === 0
                ? t("commandPalette.ask.searching")
                : t("commandPalette.ask.reading")}
              <span className="block text-xs text-muted-foreground">
                {t("commandPalette.ask.localModelNote")}
              </span>
            </span>
          </div>
        )}

        {state.error && (
          <div className="py-2 text-sm">
            <p className="text-negative-foreground">{state.error}</p>
            <button
              onClick={onRetry}
              className="mt-2 rounded-xl px-2 py-1 text-xs font-medium text-foreground hover:bg-tint-soft"
            >
              {t("common.retry")}
            </button>
          </div>
        )}

        {state.answer && (
          <div className="text-sm leading-7 text-foreground [&_li]:ml-5 [&_li]:list-disc [&_p]:mb-2 [&_strong]:font-semibold">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                a: ({ href, children }) => (
                  <button
                    type="button"
                    onClick={() => href && onNavigate(href)}
                    className="mx-0.5 rounded bg-tint-soft px-1 align-baseline text-xs font-medium text-foreground hover:bg-tint"
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
          <div className="mt-4 border-t border-border pt-3">
            <p className="etiquette mb-3">
              {t("commandPalette.resourcesConsulted")}
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
                      className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-sm hover:bg-secondary"
                    >
                      <span
                        className={cn(
                          "w-6 shrink-0 text-xs tabular-nums",
                          source.cited
                            ? "font-semibold text-foreground"
                            : "text-muted-foreground"
                        )}
                      >
                        [{source.n}]
                      </span>
                      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="truncate text-foreground">
                        {source.title}
                      </span>
                      {source.subtitle && (
                        <span className="ml-auto truncate pl-2 text-xs text-muted-foreground">
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
