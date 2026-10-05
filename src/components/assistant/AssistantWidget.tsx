"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { usePathname, useRouter } from "next/navigation";

import {
  ArrowUp,
  Brain,
  Calendar,
  CheckSquare,
  ChevronDown,
  ExternalLink,
  FileText,
  FolderKanban,
  Globe,
  Loader2,
  Mail,
  Mic,
  RotateCcw,
  Square,
  User,
  X,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";

import { openDeepLink } from "@/hooks/use-deep-link";

import { useAssistantStore } from "@/store/assistant";

import { Mascot } from "./Mascot";

/* ------------------------------------------------------------------ types */

interface LinkItem {
  type: string;
  title: string;
  subtitle?: string;
  url: string;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  /** Assistant only: tool steps ("Recherche dans les courriels…"). */
  steps?: string[];
  thinking?: string;
  links?: LinkItem[];
  error?: string;
  pending?: boolean;
}

type AssistantEvent =
  | { type: "status"; text: string }
  | { type: "thinking"; text: string }
  | { type: "text"; text: string }
  | { type: "links"; items: LinkItem[] }
  | { type: "error"; text: string }
  | { type: "done" };

/* --------------------------------------------------------------- position */

const SIZE = 56; // mascot button, px
const MARGIN = 12;
const POS_KEY = "dreamdash.assistant.pos.v2";
const CHAT_KEY = "dreamdash.assistant.chat";

/** Offsets from the bottom-right corner, so it stays put across resizes. */
interface Pos {
  right: number;
  bottom: number;
}
const DEFAULT_POS: Pos = { right: 16, bottom: 16 };

function clampPos(p: Pos): Pos {
  if (typeof window === "undefined") return p;
  const maxRight = window.innerWidth - SIZE - MARGIN;
  const maxBottom = window.innerHeight - SIZE - MARGIN;
  return {
    right: Math.min(Math.max(MARGIN, p.right), Math.max(MARGIN, maxRight)),
    bottom: Math.min(Math.max(MARGIN, p.bottom), Math.max(MARGIN, maxBottom)),
  };
}

function readJson<T>(storage: () => Storage, key: string): T | null {
  try {
    const raw = storage().getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(storage: () => Storage, key: string, value: unknown) {
  try {
    storage().setItem(key, JSON.stringify(value));
  } catch {
    // private mode / quota — the widget works without it
  }
}

const LINK_ICON: Record<string, typeof Mail> = {
  email: Mail,
  task: CheckSquare,
  event: Calendar,
  note: FileText,
  recording: Mic,
  project: FolderKanban,
  activity: FolderKanban,
  contact: User,
  web: Globe,
};

/* ----------------------------------------------------------------- widget */

/**
 * The mascot in the corner: a draggable button that opens a chat with the
 * DreamDash assistant (/api/assistant/chat). The assistant knows which page
 * and item are on screen, digs through mail/tasks/calendar/notes, and answers
 * with links that jump straight to the item.
 */
export function AssistantWidget() {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const focus = useAssistantStore((s) => s.focus);

  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<Pos>(DEFAULT_POS);
  const [dragging, setDragging] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const drag = useRef<{
    startX: number;
    startY: number;
    origin: Pos;
    moved: boolean;
  } | null>(null);

  // Restore position and the conversation (per tab session).
  useEffect(() => {
    const saved = readJson<Pos>(() => window.localStorage, POS_KEY);
    setPos(clampPos(saved ?? DEFAULT_POS));
    const chat = readJson<Message[]>(() => window.sessionStorage, CHAT_KEY);
    if (chat) setMessages(chat.filter((m) => !m.pending));

    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    const onResize = () => setPos((p) => clampPos(p));
    window.addEventListener("resize", onResize);
    return () => {
      mq.removeEventListener("change", update);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  useEffect(() => {
    if (!busy) writeJson(() => window.sessionStorage, CHAT_KEY, messages);
  }, [messages, busy]);

  // Keep the newest message in view.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, open]);

  useEffect(() => {
    if (open && !isMobile) inputRef.current?.focus();
  }, [open, isMobile]);

  // Escape closes the panel.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  /* -------------------------------------------------------------- drag */

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { startX: e.clientX, startY: e.clientY, origin: pos, moved: false };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && Math.hypot(dx, dy) < 6) return;
    if (!d.moved) {
      d.moved = true;
      setDragging(true);
    }
    setPos(clampPos({ right: d.origin.right - dx, bottom: d.origin.bottom - dy }));
  };

  const onPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    drag.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
    if (d?.moved) {
      setDragging(false);
      setPos((p) => {
        writeJson(() => window.localStorage, POS_KEY, p);
        return p;
      });
    } else {
      setOpen((o) => !o);
    }
  };

  /* -------------------------------------------------------------- chat */

  const patchLast = useCallback((fn: (m: Message) => Message) => {
    setMessages((prev) => {
      if (!prev.length) return prev;
      const next = prev.slice();
      next[next.length - 1] = fn(next[next.length - 1]);
      return next;
    });
  }, []);

  const send = async (text: string) => {
    const question = text.trim();
    if (!question || busy) return;
    setInput("");

    const history = [...messages, { role: "user" as const, content: question }];
    setMessages([...history, { role: "assistant", content: "", steps: [], pending: true }]);
    setBusy(true);

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          // Only completed turns; failed answers aren't worth resending.
          messages: history
            .filter((m) => m.content.trim() && !m.error)
            .slice(-20)
            .map((m) => ({ role: m.role, content: m.content })),
          context: {
            path: `${window.location.pathname}${window.location.search}`,
            title: document.title,
            focus,
          },
        }),
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const ev = JSON.parse(line) as AssistantEvent;
          switch (ev.type) {
            case "status":
              patchLast((m) => ({ ...m, steps: [...(m.steps ?? []), ev.text] }));
              break;
            case "thinking":
              patchLast((m) => ({ ...m, thinking: (m.thinking ?? "") + ev.text }));
              break;
            case "text":
              patchLast((m) => ({ ...m, content: m.content + ev.text }));
              break;
            case "links":
              patchLast((m) => ({ ...m, links: ev.items }));
              break;
            case "error":
              patchLast((m) => ({ ...m, error: ev.text }));
              break;
          }
        }
      }
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        patchLast((m) => ({ ...m, error: t("assistant.error") }));
      }
    } finally {
      patchLast((m) => ({ ...m, pending: false, content: m.content.trim() }));
      setBusy(false);
      abortRef.current = null;
    }
  };

  const stop = () => abortRef.current?.abort();

  const reset = () => {
    stop();
    setMessages([]);
    inputRef.current?.focus();
  };

  const go = (url: string) => {
    openDeepLink(url, router.push);
    if (isMobile) setOpen(false);
  };

  if (pathname?.startsWith("/auth") || pathname === "/setup") return null;

  /* ------------------------------------------------------------ layout */

  // Open the panel on whichever side of the mascot has room.
  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const onRight = pos.right < vw / 2;
  const nearBottom = pos.bottom < vh / 2;
  const panelStyle: React.CSSProperties = isMobile
    ? {}
    : {
        ...(onRight ? { right: pos.right } : { left: vw - pos.right - SIZE }),
        ...(nearBottom
          ? { bottom: pos.bottom + SIZE + 10 }
          : { top: vh - pos.bottom + 10 }),
      };

  const suggestions = [
    t("assistant.suggestion.mail"),
    t("assistant.suggestion.today"),
    t("assistant.suggestion.page"),
  ];

  return (
    <>
      {open && (
        <div
          role="dialog"
          aria-label={t("assistant.title")}
          style={panelStyle}
          className={cn(
            "fixed z-[60] flex flex-col overflow-hidden border border-border bg-card text-card-foreground shadow-float",
            "duration-200 animate-in fade-in zoom-in-95",
            isMobile
              ? "inset-x-2 bottom-2 top-14 rounded-2xl"
              : "h-[min(600px,calc(100dvh-120px))] w-[400px] max-w-[calc(100vw-24px)] rounded-2xl"
          )}
        >
          {/* header */}
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <Mascot className="h-7 w-7 dark:text-white" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold leading-tight">
                {t("assistant.title")}
              </div>
              <div className="truncate text-[11px] text-muted-foreground">
                {focus || t("assistant.subtitle")}
              </div>
            </div>
            {messages.length > 0 && (
              <button
                onClick={reset}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                title={t("assistant.newChat")}
                aria-label={t("assistant.newChat")}
              >
                <RotateCcw className="h-4 w-4" />
              </button>
            )}
            <button
              onClick={() => setOpen(false)}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label={t("assistant.close")}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* messages */}
          <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
            {messages.length === 0 && (
              <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
                <Mascot className="h-14 w-14 dark:text-white" />
                <p className="text-sm text-muted-foreground">{t("assistant.empty")}</p>
                <div className="flex flex-col gap-1.5">
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="rounded-full border border-border px-3 py-1.5 text-xs hover:bg-muted"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="flex justify-end">
                  <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-primary px-3 py-2 text-sm text-primary-foreground">
                    {m.content}
                  </div>
                </div>
              ) : (
                <AssistantBubble key={i} message={m} onLink={go} />
              )
            )}
          </div>

          {/* composer */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="flex items-end gap-2 border-t border-border p-2"
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  send(input);
                }
              }}
              rows={1}
              placeholder={t("assistant.placeholder")}
              className="max-h-32 min-h-[38px] flex-1 resize-none rounded-xl border border-input bg-background px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-ring md:text-sm"
            />
            {busy ? (
              <button
                type="button"
                onClick={stop}
                className="flex h-[38px] w-[38px] items-center justify-center rounded-xl bg-muted text-foreground hover:bg-muted/80"
                aria-label={t("assistant.stop")}
              >
                <Square className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
                className="flex h-[38px] w-[38px] items-center justify-center rounded-xl bg-primary text-primary-foreground disabled:opacity-40"
                aria-label={t("assistant.send")}
              >
                <ArrowUp className="h-4 w-4" />
              </button>
            )}
          </form>
        </div>
      )}

      {/* the mascot — hidden on mobile while the full-screen panel is open */}
      {!(isMobile && open) && (
        <button
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => {
            drag.current = null;
            setDragging(false);
          }}
          style={{ right: pos.right, bottom: pos.bottom, width: SIZE, height: SIZE, touchAction: "none" }}
          className={cn(
            "fixed z-[60] flex select-none items-center justify-center rounded-full",
            "drop-shadow-[0_6px_14px_rgba(25,24,28,0.35)] transition-transform",
            dragging ? "scale-110 cursor-grabbing" : "cursor-grab hover:scale-105",
            busy && "animate-pulse"
          )}
          title={t("assistant.open")}
          aria-label={t("assistant.open")}
          aria-expanded={open}
        >
          <Mascot outlined className="pointer-events-none h-full w-full" />
          {busy && (
            <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-white bg-amber-400" />
          )}
        </button>
      )}
    </>
  );
}

/* --------------------------------------------------------------- bubbles */

function AssistantBubble({
  message: m,
  onLink,
}: {
  message: Message;
  onLink: (url: string) => void;
}) {
  const t = useT();
  const [showWork, setShowWork] = useState(false);
  const hasWork = (m.steps?.length ?? 0) > 0 || !!m.thinking;
  const working = m.pending && !m.content;

  return (
    <div className="flex gap-2">
      <Mascot className="mt-0.5 h-6 w-6 shrink-0 dark:text-white" />
      <div className="min-w-0 flex-1 space-y-2">
        {hasWork && (
          <div className="rounded-lg border border-border bg-muted/40 text-xs">
            <button
              onClick={() => setShowWork((s) => !s)}
              className="flex w-full items-center gap-1.5 px-2 py-1.5 text-muted-foreground"
            >
              {working ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Brain className="h-3.5 w-3.5" />
              )}
              <span className="min-w-0 flex-1 truncate text-left">
                {working
                  ? m.steps?.[m.steps.length - 1] || t("assistant.thinking")
                  : t("assistant.workDone", { count: m.steps?.length ?? 0 })}
              </span>
              <ChevronDown
                className={cn("h-3.5 w-3.5 transition-transform", showWork && "rotate-180")}
              />
            </button>
            {showWork && (
              <div className="space-y-1.5 border-t border-border px-2 py-1.5">
                {m.steps?.map((s, i) => (
                  <div key={i} className="text-muted-foreground">
                    • {s}
                  </div>
                ))}
                {m.thinking && (
                  <div className="max-h-48 overflow-y-auto whitespace-pre-wrap italic text-muted-foreground/80">
                    {m.thinking}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {working && !hasWork && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {t("assistant.thinking")}
          </div>
        )}

        {m.content && (
          <div className="text-sm leading-relaxed [&_a]:break-words [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold [&_li]:my-0.5 [&_ol]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1.5 [&_strong]:font-semibold [&_ul]:my-1.5 [&_ul]:list-disc [&_ul]:pl-5">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                a: ({ href, children }) =>
                  href?.startsWith("/") ? (
                    <a
                      href={href}
                      onClick={(e) => {
                        e.preventDefault();
                        onLink(href);
                      }}
                      className="font-medium text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
                    >
                      {children}
                    </a>
                  ) : (
                    <a href={href} target="_blank" rel="noopener noreferrer">
                      {children}
                    </a>
                  ),
              }}
            >
              {m.content}
            </ReactMarkdown>
          </div>
        )}

        {m.error && <div className="text-xs text-destructive">{m.error}</div>}

        {!m.pending && m.links && m.links.length > 0 && (
          <div className="flex flex-col gap-1">
            {m.links.map((l) => {
              const Icon = LINK_ICON[l.type] ?? ExternalLink;
              return (
                <button
                  key={l.url}
                  onClick={() => onLink(l.url)}
                  className="flex items-center gap-2 rounded-lg border border-border px-2 py-1.5 text-left hover:bg-muted"
                >
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium">{l.title}</span>
                    {l.subtitle && (
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {l.subtitle}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
