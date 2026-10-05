"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  AlertCircle,
  ChevronLeft,
  Inbox,
  Mails,
  Loader2,
  Mail,
  Paperclip,
  PenSquare,
  Plus,
  RefreshCw,
  Reply,
  Search,
  Send,
  X,
} from "lucide-react";

import { useT, type TranslateFn } from "@/i18n/client";
import {
  MAIL_ACCOUNT_COLORS,
  type MailAccountColor,
  isMailAccountColor,
} from "@/lib/mail/colors";
import { PROVIDER_PRESETS } from "@/lib/mail/providers";
import { cn } from "@/lib/utils";

import { accountVisibleInStation, useStationStore } from "@/store/station";

interface Account {
  id: string;
  provider: string;
  displayName: string | null;
  email: string;
  station?: string | null;
  color?: string | null;
}

interface Address {
  name?: string;
  address?: string;
}

interface MessageSummary {
  uid: number;
  subject: string;
  from: Address[];
  to: Address[];
  date: string | null;
  seen: boolean;
  flagged: boolean;
  hasAttachments: boolean;
}

interface MessageDetail extends MessageSummary {
  cc: Address[];
  html: string | null;
  text: string | null;
  messageId: string | null;
  references: string[];
  attachments: { filename: string; size: number; contentType: string }[];
}

const fmtAddr = (a: Address[], unknownLabel: string) =>
  a.map((x) => x.name || x.address || "").filter(Boolean).join(", ") ||
  unknownLabel;

const fmtDate = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay
    ? d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

/** Pseudo account id for the unified « Toutes les boîtes » view. */
const ALL = "all";

/** Fallback colour dots (by connection order) for boxes with no colour set. */
const ACCOUNT_DOTS = [
  "bg-sky-500",
  "bg-amber-500",
  "bg-emerald-500",
  "bg-rose-500",
  "bg-violet-500",
  "bg-teal-500",
];

/** A listed message, tagged with where it lives (uids clash across boxes). */
interface ListedMessage extends MessageSummary {
  accountId: string;
  mailbox: string;
}

const keyOf = (m: ListedMessage) => `${m.accountId}:${m.mailbox}:${m.uid}`;

const accountLabel = (a: Account) => a.displayName || a.email;

/** User-facing label for a known IMAP folder; falls back to the raw name. */
const folderLabel = (t: TranslateFn, name: string) => {
  const key = `mail.folder.${name.toLowerCase()}`;
  const translated = t(key);
  return translated === key ? name : translated;
};

/** Provider label/hint lookup — falls back to the preset's own copy. */
const translateProviderLabel = (
  t: TranslateFn,
  id: string,
  fallback: string
) => {
  const key = `mail.provider.${id}.label`;
  const translated = t(key);
  return translated === key ? fallback : translated;
};

const translateProviderHint = (
  t: TranslateFn,
  id: string,
  fallback: string
) => {
  const key = `mail.provider.${id}.hint`;
  const translated = t(key);
  return translated === key ? fallback : translated;
};

/** Short chip label for the mobile switcher: display name or local part. */
const shortLabel = (a: Account) => a.displayName || a.email.split("@")[0];

/** The unified view only makes sense with two or more boxes. */
const defaultTarget = (visible: Account[]) =>
  visible.length >= 2 ? ALL : (visible[0]?.id ?? null);

export function EmailClient() {
  const t = useT();
  const currentStation = useStationStore((s) => s.currentStation);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const accountsRef = useRef<Account[]>([]);
  // An account id, or ALL for the merged inboxes.
  const [accountId, setAccountId] = useState<string | null>(null);
  const [folders, setFolders] = useState<string[]>([]);
  const [mailbox, setMailbox] = useState("INBOX");

  const [messages, setMessages] = useState<ListedMessage[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [failedBoxes, setFailedBoxes] = useState<string[]>([]);
  const [search, setSearch] = useState("");

  const [selected, setSelected] = useState<ListedMessage | null>(null);
  const [detail, setDetail] = useState<MessageDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [initializing, setInitializing] = useState(true);
  const [showConnect, setShowConnect] = useState(false);
  const [compose, setCompose] = useState<ComposeState | null>(null);

  const loadAccounts = useCallback(async () => {
    const res = await fetch("/api/mail/accounts");
    const data = res.ok ? await res.json() : { accounts: [] };
    accountsRef.current = data.accounts ?? [];
    setAccounts(accountsRef.current);
    return accountsRef.current;
  }, []);

  const loadMessages = useCallback(
    async (acctId: string, box: string, q: string, withFolders: boolean) => {
      setLoadingList(true);
      setListError(null);
      setFailedBoxes([]);
      try {
        const params = new URLSearchParams({
          accountId: acctId,
          mailbox: box,
          limit: "40",
        });
        if (acctId === ALL) {
          // Only the boxes visible under the active station.
          const station = useStationStore.getState().currentStation;
          const ids = accountsRef.current
            .filter((a) => accountVisibleInStation(a.station, station))
            .map((a) => a.id);
          params.set("accounts", ids.join(","));
          params.set("limit", "25");
        }
        if (q.trim()) params.set("q", q.trim());
        if (withFolders) params.set("folders", "1");
        const res = await fetch(`/api/mail/messages?${params}`);
        if (!res.ok) {
          const e = await res.json().catch(() => ({}));
          throw new Error(e.error || t("mail.errors.loadFailed"));
        }
        const data = await res.json();
        const list: (MessageSummary & Partial<ListedMessage>)[] =
          data.messages ?? [];
        setMessages(
          list.map((m) => ({
            ...m,
            accountId: m.accountId ?? acctId,
            mailbox: m.mailbox ?? box,
          }))
        );
        if (data.folders) setFolders(data.folders);
        if (Array.isArray(data.failed)) {
          setFailedBoxes(
            (data.failed as { email: string }[]).map((f) => f.email)
          );
        }
      } catch (err) {
        setListError(
          err instanceof Error ? err.message : t("mail.errors.loadFailed")
        );
        setMessages([]);
      } finally {
        setLoadingList(false);
      }
    },
    [t]
  );

  // Initial load — « Toutes les boîtes » when several accounts are visible
  // under the active station, otherwise the only one.
  useEffect(() => {
    (async () => {
      const accts = await loadAccounts();
      const station = useStationStore.getState().currentStation;
      const visible = accts.filter((a) =>
        accountVisibleInStation(a.station, station)
      );
      const target = defaultTarget(visible) ?? accts[0]?.id ?? null;
      if (target) {
        setAccountId(target);
        await loadMessages(target, "INBOX", "", target !== ALL);
      }
      setInitializing(false);
    })();
  }, [loadAccounts, loadMessages]);

  const switchAccount = async (id: string) => {
    setAccountId(id);
    setMailbox("INBOX");
    setSelected(null);
    setDetail(null);
    setSearch("");
    setFolders([]);
    await loadMessages(id, "INBOX", "", id !== ALL);
  };

  // Accounts shown under the active station (untagged always show).
  const visibleAccounts = accounts.filter((a) =>
    accountVisibleInStation(a.station, currentStation)
  );
  const unified = accountId === ALL;

  // If switching station hides the open account (or changes which boxes the
  // unified view covers), jump to the station's default view.
  useEffect(() => {
    if (initializing || accounts.length === 0) return;
    if (!unified && accountId && visibleAccounts.some((a) => a.id === accountId))
      return;
    const next = defaultTarget(visibleAccounts);
    if (next) {
      switchAccount(next);
    } else {
      setAccountId(null);
      setMessages([]);
      setSelected(null);
      setDetail(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStation]);

  const switchMailbox = async (box: string) => {
    if (!accountId || unified) return;
    setMailbox(box);
    setSelected(null);
    setDetail(null);
    await loadMessages(accountId, box, search, false);
  };

  const selectMessage = async (m: ListedMessage) => {
    const key = keyOf(m);
    setSelected(m);
    setDetail(null);
    setLoadingDetail(true);
    try {
      const params = new URLSearchParams({
        accountId: m.accountId,
        mailbox: m.mailbox,
      });
      const res = await fetch(`/api/mail/messages/${m.uid}?${params}`);
      if (!res.ok) throw new Error(t("mail.loadMessageFailed"));
      const data = await res.json();
      setDetail(data.message);
      // Optimistically mark read in the list.
      setMessages((prev) =>
        prev.map((x) => (keyOf(x) === key ? { ...x, seen: true } : x))
      );
    } catch {
      setDetail(null);
    } finally {
      setLoadingDetail(false);
    }
  };

  const closeMessage = () => {
    setSelected(null);
    setDetail(null);
  };

  const runSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (accountId) loadMessages(accountId, mailbox, search, false);
  };

  // New mail goes out from the open box, or the first visible one in the
  // unified view (the From field lets the user change it).
  const startCompose = () => {
    const from =
      (!unified && accountId) || visibleAccounts[0]?.id || accounts[0]?.id;
    if (from) setCompose({ accountId: from, to: "", cc: "", subject: "", body: "" });
  };

  const startReply = (m: MessageDetail, fromAccountId: string) => {
    const original = m.text || "";
    const quoted = original
      .split("\n")
      .map((l) => `> ${l}`)
      .join("\n");
    setCompose({
      accountId: fromAccountId,
      to: m.from[0]?.address || "",
      cc: "",
      subject: m.subject.startsWith("Re:") ? m.subject : `Re: ${m.subject}`,
      body: `\n\n----\n${quoted}`,
      inReplyTo: m.messageId || undefined,
      references: [...m.references, ...(m.messageId ? [m.messageId] : [])],
    });
  };

  const dotFor = (id: string) => {
    const idx = accounts.findIndex((a) => a.id === id);
    const color = accounts[idx]?.color;
    return isMailAccountColor(color)
      ? MAIL_ACCOUNT_COLORS[color]
      : ACCOUNT_DOTS[Math.max(0, idx) % ACCOUNT_DOTS.length];
  };

  if (initializing) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (accounts.length === 0) {
    return (
      <>
        <div className="mx-auto flex h-full max-w-md flex-col items-center justify-center p-6 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Mail className="h-7 w-7" />
          </div>
          <h1 className="mt-4 text-xl font-semibold">
            {t("mail.empty.title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("mail.empty.description")}
          </p>
          <button
            onClick={() => setShowConnect(true)}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" /> {t("mail.empty.connect")}
          </button>
        </div>
        {showConnect && (
          <ConnectModal
            onClose={() => setShowConnect(false)}
            onConnected={async () => {
              setShowConnect(false);
              setInitializing(true);
              const accts = await loadAccounts();
              if (accts.length > 0) {
                setAccountId(accts[0].id);
                await loadMessages(accts[0].id, "INBOX", "", true);
              }
              setInitializing(false);
            }}
          />
        )}
      </>
    );
  }

  const activeAccount = accounts.find((a) => a.id === accountId);
  const selectedAccount = selected
    ? accounts.find((a) => a.id === selected.accountId)
    : undefined;
  const showAllEntry = visibleAccounts.length >= 2;

  return (
    <div className="flex h-full">
      {/* Rail: accounts + folders (desktop) */}
      <div className="hidden w-56 flex-none flex-col border-r border-border bg-card md:flex">
        <div className="p-3">
          <button
            onClick={startCompose}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <PenSquare className="h-4 w-4" /> {t("mail.compose")}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-2">
          {unified ? (
            <div className="space-y-2 px-2 py-1.5">
              <p className="etiquette">{t("mail.inboxes")}</p>
              <ul className="space-y-1">
                {visibleAccounts.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-center gap-2 text-xs text-muted-foreground"
                  >
                    <span
                      className={cn("h-2 w-2 shrink-0 rounded-full", dotFor(a.id))}
                    />
                    <span className="truncate">{accountLabel(a)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : folders.length > 0 ? (
            <ul className="space-y-0.5">
              {folders.map((f) => (
                <li key={f}>
                  <button
                    onClick={() => switchMailbox(f)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm",
                      mailbox === f
                        ? "bg-primary/10 font-medium text-primary"
                        : "text-foreground/80 hover:bg-accent hover:text-accent-foreground"
                    )}
                  >
                    <Inbox className="h-4 w-4 shrink-0" />
                    <span className="truncate">{folderLabel(t, f)}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex items-center gap-2 px-2 py-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />{" "}
              {t("mail.loadingFolders")}
            </div>
          )}
        </div>

        {/* Account switcher (filtered by the active station) */}
        <div className="border-t border-border p-2">
          {visibleAccounts.length === 0 && accounts.length > 0 && (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">
              {t("mail.noAccountsInStation")}
            </p>
          )}
          {showAllEntry && (
            <button
              onClick={() => switchAccount(ALL)}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs",
                unified
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent"
              )}
            >
              <Mails className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{t("mail.allInboxes")}</span>
            </button>
          )}
          {visibleAccounts.map((a) => (
            <button
              key={a.id}
              onClick={() => switchAccount(a.id)}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs",
                a.id === accountId
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent"
              )}
            >
              <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                <span className={cn("h-2 w-2 rounded-full", dotFor(a.id))} />
              </span>
              <span className="truncate">{a.email}</span>
            </button>
          ))}
          <button
            onClick={() => setShowConnect(true)}
            className="mt-1 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent"
          >
            <Plus className="h-3.5 w-3.5" /> {t("mail.addAccount")}
          </button>
        </div>
      </div>

      {/* Message list (full width on mobile, hidden while reading) */}
      <div
        className={cn(
          "w-full min-w-0 flex-none flex-col border-r border-border md:flex md:w-80",
          selected ? "hidden" : "flex"
        )}
      >
        {/* Mobile switcher: boxes as a scrollable segmented control */}
        <div className="flex items-center gap-2 border-b border-border px-3 py-2 md:hidden">
          <div className="min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="segmented">
              {showAllEntry && (
                <button
                  onClick={() => switchAccount(ALL)}
                  aria-pressed={unified}
                  className="segmented-item"
                >
                  {t("mail.allInboxes")}
                </button>
              )}
              {visibleAccounts.map((a) => (
                <button
                  key={a.id}
                  onClick={() => switchAccount(a.id)}
                  aria-pressed={a.id === accountId}
                  className="segmented-item"
                  title={a.email}
                >
                  <span className={cn("h-2 w-2 rounded-full", dotFor(a.id))} />
                  {shortLabel(a)}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={startCompose}
            className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
            title={t("mail.compose")}
          >
            <PenSquare className="h-4 w-4" />
          </button>
        </div>
        {!unified && folders.length > 1 && (
          <div className="border-b border-border px-3 py-1.5 md:hidden">
            <select
              value={mailbox}
              onChange={(e) => switchMailbox(e.target.value)}
              className="w-full bg-transparent text-sm outline-none"
            >
              {folders.map((f) => (
                <option key={f} value={f}>
                  {folderLabel(t, f)}
                </option>
              ))}
            </select>
          </div>
        )}

        <form
          onSubmit={runSearch}
          className="flex items-center gap-2 border-b border-border px-3 py-2"
        >
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={
              unified
                ? t("mail.searchAll")
                : t("mail.searchIn", { mailbox: folderLabel(t, mailbox) })
            }
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <button
            type="button"
            onClick={() =>
              accountId && loadMessages(accountId, mailbox, search, false)
            }
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            title={t("mail.refresh")}
          >
            <RefreshCw className={cn("h-4 w-4", loadingList && "animate-spin")} />
          </button>
        </form>

        {failedBoxes.length > 0 && !loadingList && (
          <p className="flex items-center gap-1.5 border-b border-border px-3 py-1.5 text-xs text-destructive">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              {t("mail.unreachable", { boxes: failedBoxes.join(", ") })}
            </span>
          </p>
        )}

        <div className="flex-1 overflow-y-auto">
          {loadingList ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
            </div>
          ) : listError ? (
            <div className="flex flex-col items-center gap-2 px-4 py-8 text-center text-sm text-destructive">
              <AlertCircle className="h-5 w-5" />
              {listError}
            </div>
          ) : messages.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              {t("mail.noMessages")}
            </p>
          ) : (
            <ul>
              {messages.map((m) => {
                const acct = unified
                  ? accounts.find((a) => a.id === m.accountId)
                  : undefined;
                return (
                  <li key={keyOf(m)}>
                    <button
                      onClick={() => selectMessage(m)}
                      className={cn(
                        "flex w-full flex-col gap-0.5 border-b border-border px-3 py-2.5 text-left",
                        selected && keyOf(selected) === keyOf(m)
                          ? "bg-primary/5"
                          : "hover:bg-accent/50"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        {!m.seen && (
                          <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />
                        )}
                        <span
                          className={cn(
                            "min-w-0 flex-1 truncate text-sm",
                            !m.seen ? "font-semibold" : "font-medium"
                          )}
                        >
                          {fmtAddr(m.from, t("mail.unknownSender"))}
                        </span>
                        {m.hasAttachments && (
                          <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground" />
                        )}
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {fmtDate(m.date)}
                        </span>
                      </div>
                      <span
                        className={cn(
                          "truncate text-sm",
                          !m.seen ? "text-foreground" : "text-muted-foreground"
                        )}
                      >
                        {m.subject}
                      </span>
                      {acct && (
                        <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
                          <span
                            className={cn(
                              "h-1.5 w-1.5 shrink-0 rounded-full",
                              dotFor(acct.id)
                            )}
                          />
                          <span className="truncate">{accountLabel(acct)}</span>
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Reading pane (replaces the list on mobile) */}
      <div
        className={cn(
          "min-w-0 flex-1 overflow-y-auto md:block",
          selected ? "block" : "hidden"
        )}
      >
        {!selected ? (
          <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground">
            <Mail className="h-10 w-10 opacity-40" />
            <p className="mt-3 text-sm">
              {unified
                ? t("mail.selectMessage")
                : activeAccount
                  ? t("mail.selectMessageIn", { email: activeAccount.email })
                  : t("mail.selectMessage")}
            </p>
          </div>
        ) : loadingDetail ? (
          <div className="flex h-full flex-col">
            <BackBar onBack={closeMessage} />
            <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />{" "}
              {t("mail.loadingMessage")}
            </div>
          </div>
        ) : !detail ? (
          <div className="flex h-full flex-col">
            <BackBar onBack={closeMessage} />
            <div className="flex flex-1 items-center justify-center text-sm text-destructive">
              {t("mail.loadMessageFailed")}
            </div>
          </div>
        ) : (
          <MessageView
            detail={detail}
            onBack={closeMessage}
            onReply={() => startReply(detail, selected.accountId)}
            account={
              selectedAccount && (unified || accounts.length > 1)
                ? {
                    label: `${accountLabel(selectedAccount)} · ${folderLabel(t, selected.mailbox)}`,
                    dot: dotFor(selectedAccount.id),
                  }
                : undefined
            }
          />
        )}
      </div>

      {showConnect && (
        <ConnectModal
          onClose={() => setShowConnect(false)}
          onConnected={async () => {
            setShowConnect(false);
            const accts = await loadAccounts();
            const newest = accts[accts.length - 1];
            if (newest) await switchAccount(newest.id);
          }}
        />
      )}

      {compose && (
        <ComposeModal
          accounts={accounts.filter(
            (a) =>
              a.id === compose.accountId ||
              accountVisibleInStation(a.station, currentStation)
          )}
          initial={compose}
          onClose={() => setCompose(null)}
        />
      )}
    </div>
  );
}

/** Mobile-only "back to the list" bar above the reading pane. */
function BackBar({ onBack }: { onBack: () => void }) {
  const t = useT();
  return (
    <div className="border-b border-border px-2 py-1.5 md:hidden">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" /> {t("common.back")}
      </button>
    </div>
  );
}

function MessageView({
  detail,
  onBack,
  onReply,
  account,
}: {
  detail: MessageDetail;
  onBack: () => void;
  onReply: () => void;
  /** Which box it came from — shown when several boxes are in play. */
  account?: { label: string; dot: string };
}) {
  const t = useT();
  return (
    <article className="flex h-full flex-col">
      <BackBar onBack={onBack} />
      <div className="border-b border-border p-4 md:p-5">
        {account && (
          <p className="etiquette mb-2 flex min-w-0 items-center gap-1.5 normal-case tracking-normal">
            <span className={cn("h-2 w-2 shrink-0 rounded-full", account.dot)} />
            <span className="truncate">{account.label}</span>
          </p>
        )}
        <div className="mb-3 flex items-start justify-between gap-4">
          <h1 className="min-w-0 break-words text-lg font-semibold">
            {detail.subject}
          </h1>
          <button
            onClick={onReply}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-accent"
          >
            <Reply className="h-4 w-4" /> {t("mail.reply")}
          </button>
        </div>
        <div className="space-y-0.5 text-sm">
          <p>
            <span className="text-muted-foreground">{t("mail.fromLabel")} </span>
            {fmtAddr(detail.from, t("mail.unknownSender"))}
          </p>
          <p>
            <span className="text-muted-foreground">{t("mail.toLabel")} </span>
            {fmtAddr(detail.to, t("mail.unknownSender"))}
            {detail.cc.length > 0 &&
              ` · ${t("mail.ccLabel")} ${fmtAddr(detail.cc, t("mail.unknownSender"))}`}
          </p>
          {detail.date && (
            <p className="text-xs text-muted-foreground">
              {new Date(detail.date).toLocaleString()}
            </p>
          )}
        </div>
        {detail.attachments.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {detail.attachments.map((a, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2 py-1 text-xs text-muted-foreground"
              >
                <Paperclip className="h-3 w-3" />
                {a.filename}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1">
        {detail.html ? (
          // Sandboxed iframe: no allow-scripts → email JS can't run (XSS-safe).
          <iframe
            title={t("mail.messageBody")}
            sandbox=""
            className="h-full w-full bg-white"
            srcDoc={detail.html}
          />
        ) : (
          <pre className="whitespace-pre-wrap p-5 font-sans text-sm leading-7 text-foreground/90">
            {detail.text || t("mail.emptyMessage")}
          </pre>
        )}
      </div>
    </article>
  );
}

interface ComposeState {
  /** Account the mail is sent from. */
  accountId: string;
  to: string;
  cc: string;
  subject: string;
  body: string;
  inReplyTo?: string;
  references?: string[];
}

function ComposeModal({
  accounts,
  initial,
  onClose,
}: {
  accounts: Account[];
  initial: ComposeState;
  onClose: () => void;
}) {
  const t = useT();
  const [accountId, setAccountId] = useState(initial.accountId);
  const [to, setTo] = useState(initial.to);
  const [cc, setCc] = useState(initial.cc);
  const [showCc, setShowCc] = useState(Boolean(initial.cc));
  const [subject, setSubject] = useState(initial.subject);
  const [body, setBody] = useState(initial.body);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/mail/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          to,
          cc: cc || undefined,
          subject,
          text: body,
          inReplyTo: initial.inReplyTo,
          references: initial.references,
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || t("mail.errors.sendFailed"));
      }
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("mail.errors.sendFailed")
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-6">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-t-xl border border-border bg-card shadow-xl sm:rounded-xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">
            {t("mail.compose.title")}
          </h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={t("common.close")}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-px overflow-y-auto">
          {accounts.length > 1 ? (
            <div className="flex items-center gap-2 border-b border-border px-4 py-2 text-sm">
              <span className="w-14 shrink-0 text-muted-foreground">
                {t("mail.compose.from")}
              </span>
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="min-w-0 flex-1 bg-transparent outline-none"
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.email}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <Field
              label={t("mail.compose.from")}
              value={accounts.find((a) => a.id === accountId)?.email ?? ""}
              readOnly
            />
          )}
          <FieldInput
            label={t("mail.compose.to")}
            value={to}
            onChange={setTo}
            placeholder={t("mail.compose.toPlaceholder")}
          />
          {showCc ? (
            <FieldInput
              label={t("mail.compose.cc")}
              value={cc}
              onChange={setCc}
              placeholder={t("mail.compose.ccPlaceholder")}
            />
          ) : (
            <button
              onClick={() => setShowCc(true)}
              className="px-4 py-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              + {t("mail.compose.addCc")}
            </button>
          )}
          <FieldInput
            label={t("mail.compose.subject")}
            value={subject}
            onChange={setSubject}
            placeholder={t("mail.compose.subjectPlaceholder")}
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={t("mail.compose.bodyPlaceholder")}
            rows={12}
            className="w-full resize-none bg-transparent px-4 py-3 text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        {error && (
          <p className="px-4 pb-1 text-xs text-destructive">{error}</p>
        )}
        <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
          <button
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
          >
            {t("mail.compose.discard")}
          </button>
          <button
            onClick={send}
            disabled={sending || !to.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            {t("mail.compose.send")}
          </button>
        </div>
      </div>
    </div>
  );
}

function ConnectModal({
  onClose,
  onConnected,
}: {
  onClose: () => void;
  onConnected: () => void;
}) {
  const t = useT();
  const [provider, setProvider] = useState("icloud");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [color, setColor] = useState<MailAccountColor>("sky");
  const [imapHost, setImapHost] = useState("");
  const [smtpHost, setSmtpHost] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preset = PROVIDER_PRESETS[provider];

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/mail/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          email,
          password,
          displayName: displayName || undefined,
          color,
          ...(provider === "imap" ? { imapHost, smtpHost } : {}),
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || t("mail.errors.connectFailed"));
      }
      onConnected();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("mail.errors.connectFailed")
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">
            {t("mail.connect.title")}
          </h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={t("common.close")}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div className="flex gap-2">
            {Object.values(PROVIDER_PRESETS).map((p) => (
              <button
                key={p.id}
                onClick={() => setProvider(p.id)}
                className={cn(
                  "flex-1 rounded-lg border px-3 py-2 text-sm font-medium",
                  provider === p.id
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-accent"
                )}
              >
                {translateProviderLabel(t, p.id, p.label)}
              </button>
            ))}
          </div>

          {preset?.hint && (
            <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              {translateProviderHint(t, preset.id, preset.hint)}
            </p>
          )}

          <Labeled label={t("mail.connect.email")}>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              placeholder={t("mail.connect.emailPlaceholder")}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </Labeled>

          <Labeled label={t("mail.connect.appPassword")}>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              placeholder="xxxx-xxxx-xxxx-xxxx"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </Labeled>

          {provider === "imap" && (
            <div className="grid grid-cols-2 gap-2">
              <Labeled label={t("mail.connect.imapHost")}>
                <input
                  value={imapHost}
                  onChange={(e) => setImapHost(e.target.value)}
                  placeholder="imap.example.com"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </Labeled>
              <Labeled label={t("mail.connect.smtpHost")}>
                <input
                  value={smtpHost}
                  onChange={(e) => setSmtpHost(e.target.value)}
                  placeholder="smtp.example.com"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </Labeled>
            </div>
          )}

          <Labeled label={t("mail.connect.displayName")}>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={t("mail.connect.displayNamePlaceholder")}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </Labeled>

          <div>
            <span className="mb-1 block text-xs font-medium text-muted-foreground">
              {t("mail.connect.color")}
            </span>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(MAIL_ACCOUNT_COLORS) as MailAccountColor[]).map(
                (c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    aria-label={c}
                    aria-pressed={color === c}
                    className={cn(
                      "h-6 w-6 rounded-full ring-offset-2 ring-offset-card",
                      MAIL_ACCOUNT_COLORS[c],
                      color === c
                        ? "ring-2 ring-foreground"
                        : "hover:ring-2 hover:ring-border"
                    )}
                  />
                )
              )}
            </div>
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <button
            onClick={submit}
            disabled={busy || !email || !password}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {busy ? t("mail.connect.verifying") : t("mail.connect.submit")}
          </button>
        </div>
      </div>
    </div>
  );
}

function Labeled({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

function Field({
  label,
  value,
  readOnly,
}: {
  label: string;
  value: string;
  readOnly?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 border-b border-border px-4 py-2 text-sm">
      <span className="w-14 shrink-0 text-muted-foreground">{label}</span>
      <input
        value={value}
        readOnly={readOnly}
        className="flex-1 bg-transparent outline-none"
      />
    </div>
  );
}

function FieldInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="flex items-center gap-2 border-b border-border px-4 py-2 text-sm">
      <span className="w-14 shrink-0 text-muted-foreground">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
      />
    </div>
  );
}
