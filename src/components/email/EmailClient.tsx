"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { type TranslateFn, useT } from "@/i18n/client";
import {
  AlertCircle,
  ChevronLeft,
  Inbox,
  Loader2,
  Mail,
  Mails,
  Paperclip,
  PenSquare,
  Plus,
  RefreshCw,
  Reply,
  Search,
  Send,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import {
  MAIL_ACCOUNT_COLORS,
  type MailAccountColor,
  isMailAccountColor,
} from "@/lib/mail/colors";
import { PROVIDER_PRESETS } from "@/lib/mail/providers";
import { cn } from "@/lib/utils";

import { useDeepLink } from "@/hooks/use-deep-link";

import { useAssistantStore } from "@/store/assistant";
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
  a
    .map((x) => x.name || x.address || "")
    .filter(Boolean)
    .join(", ") || unknownLabel;

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
  // Set once a deep link (?account=&mailbox=&uid=) picked the box to show, so
  // the initial load doesn't switch back to the default view underneath it.
  const linkedRef = useRef(false);

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
      if (linkedRef.current) {
        setInitializing(false);
        return;
      }
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
    if (
      !unified &&
      accountId &&
      visibleAccounts.some((a) => a.id === accountId)
    )
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

  // /email?account=<id>&mailbox=<box>&uid=<n> opens that message directly
  // (links from the assistant and the search results).
  useDeepLink("/email", (params) => {
    const linkedAccount = params.get("account");
    const uid = Number(params.get("uid"));
    if (!linkedAccount || !Number.isFinite(uid) || uid <= 0) return;
    const box = params.get("mailbox") || "INBOX";
    linkedRef.current = true;
    setAccountId(linkedAccount);
    setMailbox(box);
    setSearch("");
    void loadMessages(linkedAccount, box, "", true);
    void selectMessage({
      uid,
      accountId: linkedAccount,
      mailbox: box,
      subject: "",
      from: [],
      to: [],
      date: null,
      seen: true,
      flagged: false,
      hasAttachments: false,
    });
  });

  // Tell the assistant which message is on screen.
  useEffect(() => {
    const setFocus = useAssistantStore.getState().setFocus;
    if (!selected || !detail) {
      setFocus(null);
      return;
    }
    const from = detail.from[0];
    setFocus(
      `Courriel ouvert : « ${detail.subject} » de ${from?.name || from?.address || "?"}` +
        (detail.date ? `, reçu le ${detail.date}` : "") +
        ` (account=${selected.accountId}, mailbox=${selected.mailbox}, uid=${selected.uid})`
    );
    return () => setFocus(null);
  }, [selected, detail]);

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
    if (from)
      setCompose({ accountId: from, to: "", cc: "", subject: "", body: "" });
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
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-secondary text-foreground">
            <Mail className="h-7 w-7" />
          </div>
          <h1 className="titre-section mt-6">{t("mail.empty.title")}</h1>
          <p className="mt-3 text-[15px] text-muted-foreground">
            {t("mail.empty.description")}
          </p>
          <Button onClick={() => setShowConnect(true)} className="mt-6">
            <Plus /> {t("mail.empty.connect")}
          </Button>
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
    <div className="flex h-full md:gap-4 md:p-4 lg:gap-5 lg:p-5">
      {/* Rail: accounts + folders (desktop) */}
      <div className="hidden w-60 flex-none flex-col md:flex">
        <div className="pb-4">
          <Button onClick={startCompose} className="w-full">
            <PenSquare /> {t("mail.compose")}
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {unified ? (
            <div className="space-y-3 px-3 py-2">
              <p className="etiquette">{t("mail.inboxes")}</p>
              <ul className="space-y-2">
                {visibleAccounts.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-center gap-2.5 text-[13px] text-foreground/80"
                  >
                    <span
                      className={cn(
                        "h-2 w-2 shrink-0 rounded-full",
                        dotFor(a.id)
                      )}
                    />
                    <span className="truncate">{accountLabel(a)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : folders.length > 0 ? (
            <ul className="space-y-1">
              {folders.map((f) => (
                <li key={f}>
                  <button
                    onClick={() => switchMailbox(f)}
                    className={cn(
                      "flex h-10 w-full items-center gap-2.5 rounded-full px-4 text-[14px] transition-colors",
                      mailbox === f
                        ? "bg-card font-semibold text-foreground shadow-tile"
                        : "text-foreground/80 hover:bg-secondary hover:text-foreground"
                    )}
                  >
                    <Inbox className="h-4 w-4 shrink-0" />
                    <span className="truncate">{folderLabel(t, f)}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex items-center gap-2 px-4 py-2 text-[13px] text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />{" "}
              {t("mail.loadingFolders")}
            </div>
          )}
        </div>

        {/* Account switcher (filtered by the active station) */}
        <div className="space-y-1 border-t border-border pt-4">
          <p className="etiquette px-3 pb-1">{t("mail.accounts")}</p>
          {visibleAccounts.length === 0 && accounts.length > 0 && (
            <p className="px-3 py-1.5 text-[13px] text-muted-foreground">
              {t("mail.noAccountsInStation")}
            </p>
          )}
          {showAllEntry && (
            <button
              onClick={() => switchAccount(ALL)}
              className={cn(
                "flex h-10 w-full items-center gap-2.5 rounded-full px-4 text-left text-[13px] transition-colors",
                unified
                  ? "bg-card font-semibold text-foreground shadow-tile"
                  : "text-foreground/80 hover:bg-secondary hover:text-foreground"
              )}
            >
              <Mails className="h-4 w-4 shrink-0" />
              <span className="truncate">{t("mail.allInboxes")}</span>
            </button>
          )}
          {visibleAccounts.map((a) => (
            <button
              key={a.id}
              onClick={() => switchAccount(a.id)}
              className={cn(
                "flex h-10 w-full items-center gap-2.5 rounded-full px-4 text-left text-[13px] transition-colors",
                a.id === accountId
                  ? "bg-card font-semibold text-foreground shadow-tile"
                  : "text-foreground/80 hover:bg-secondary hover:text-foreground"
              )}
              title={a.email}
            >
              <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                <span
                  className={cn("h-2.5 w-2.5 rounded-full", dotFor(a.id))}
                />
              </span>
              <span className="truncate">{accountLabel(a)}</span>
            </button>
          ))}
          <button
            onClick={() => setShowConnect(true)}
            className="flex h-10 w-full items-center gap-2.5 rounded-full px-4 text-[13px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <Plus className="h-4 w-4" /> {t("mail.addAccount")}
          </button>
        </div>
      </div>

      {/* Message list (full width on mobile, hidden while reading) */}
      <div
        className={cn(
          "w-full min-w-0 flex-none flex-col overflow-hidden bg-background md:flex md:w-[360px] md:rounded-[28px] md:bg-card md:shadow-tile",
          selected ? "hidden" : "flex"
        )}
      >
        {/* Mobile switcher: boxes as a scrollable segmented control */}
        <div className="flex items-center gap-2 px-4 pb-1 pt-3 md:hidden">
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
            className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
            title={t("mail.compose")}
            aria-label={t("mail.compose")}
          >
            <PenSquare className="h-4 w-4" />
          </button>
        </div>
        {!unified && folders.length > 1 && (
          <div className="px-4 pt-2 md:hidden">
            <Select value={mailbox} onValueChange={switchMailbox}>
              <SelectTrigger className="h-10 rounded-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {folders.map((f) => (
                  <SelectItem key={f} value={f}>
                    {folderLabel(t, f)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <form
          onSubmit={runSearch}
          className="flex items-center gap-2 px-4 pb-3 pt-3 md:px-5 md:pt-5"
        >
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={
                unified
                  ? t("mail.searchAll")
                  : t("mail.searchIn", { mailbox: folderLabel(t, mailbox) })
              }
              className="rounded-full pl-10"
            />
          </div>
          <button
            type="button"
            onClick={() =>
              accountId && loadMessages(accountId, mailbox, search, false)
            }
            className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-secondary text-muted-foreground transition-colors hover:bg-border hover:text-foreground"
            title={t("mail.refresh")}
            aria-label={t("mail.refresh")}
          >
            <RefreshCw
              className={cn("h-4 w-4", loadingList && "animate-spin")}
            />
          </button>
        </form>

        {failedBoxes.length > 0 && !loadingList && (
          <p className="mx-4 mb-2 flex items-center gap-1.5 rounded-full bg-destructive/10 px-4 py-2 text-[12px] text-destructive md:mx-5">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              {t("mail.unreachable", { boxes: failedBoxes.join(", ") })}
            </span>
          </p>
        )}

        <div className="flex-1 overflow-y-auto px-2 pb-2 md:px-3 md:pb-3">
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
            <ul className="space-y-0.5">
              {messages.map((m) => {
                const acct = unified
                  ? accounts.find((a) => a.id === m.accountId)
                  : undefined;
                return (
                  <li key={keyOf(m)}>
                    <button
                      onClick={() => selectMessage(m)}
                      className={cn(
                        "flex w-full flex-col gap-1 rounded-[20px] px-4 py-3 text-left transition-colors",
                        selected && keyOf(selected) === keyOf(m)
                          ? "bg-secondary"
                          : "hover:bg-secondary/60"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        {!m.seen && (
                          <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />
                        )}
                        <span
                          className={cn(
                            "min-w-0 flex-1 truncate text-[14px] tracking-title",
                            !m.seen ? "font-bold" : "font-medium"
                          )}
                        >
                          {fmtAddr(m.from, t("mail.unknownSender"))}
                        </span>
                        {m.hasAttachments && (
                          <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground" />
                        )}
                        <span className="shrink-0 text-[12px] tabular-nums text-muted-foreground">
                          {fmtDate(m.date)}
                        </span>
                      </div>
                      <span
                        className={cn(
                          "truncate text-[13px]",
                          !m.seen ? "text-foreground" : "text-muted-foreground"
                        )}
                      >
                        {m.subject}
                      </span>
                      {acct && (
                        <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[12px] text-muted-foreground">
                          <span
                            className={cn(
                              "h-2 w-2 shrink-0 rounded-full",
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
          "min-w-0 flex-1 overflow-y-auto bg-background md:block md:overflow-hidden md:rounded-[28px] md:bg-card md:shadow-tile",
          selected ? "block" : "hidden"
        )}
      >
        {!selected ? (
          <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-secondary">
              <Mail className="h-7 w-7" />
            </div>
            <p className="mt-4 text-[14px]">
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
    <div className="px-4 pt-3 md:hidden">
      <button
        onClick={onBack}
        className="inline-flex h-10 items-center gap-1 rounded-full bg-secondary pl-3 pr-4 text-[14px] font-medium text-foreground hover:bg-border"
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
      <div className="border-b border-border px-4 pb-5 pt-4 md:px-8 md:pb-6 md:pt-7">
        {account && (
          <p className="mb-3 inline-flex min-w-0 max-w-full items-center gap-2 rounded-full bg-secondary px-3 py-1.5 text-[12px] font-medium text-foreground/80">
            <span
              className={cn("h-2 w-2 shrink-0 rounded-full", account.dot)}
            />
            <span className="truncate">{account.label}</span>
          </p>
        )}
        <div className="mb-4 flex items-start justify-between gap-4">
          <h1 className="min-w-0 break-words text-[22px] font-bold leading-tight tracking-title md:text-[26px]">
            {detail.subject}
          </h1>
          <Button
            variant="secondary"
            size="sm"
            onClick={onReply}
            className="shrink-0"
          >
            <Reply /> {t("mail.reply")}
          </Button>
        </div>
        <div className="space-y-1 text-[14px]">
          <p>
            <span className="text-muted-foreground">
              {t("mail.fromLabel")}{" "}
            </span>
            {fmtAddr(detail.from, t("mail.unknownSender"))}
          </p>
          <p>
            <span className="text-muted-foreground">{t("mail.toLabel")} </span>
            {fmtAddr(detail.to, t("mail.unknownSender"))}
            {detail.cc.length > 0 &&
              ` · ${t("mail.ccLabel")} ${fmtAddr(detail.cc, t("mail.unknownSender"))}`}
          </p>
          {detail.date && (
            <p className="text-[12px] text-muted-foreground">
              {new Date(detail.date).toLocaleString()}
            </p>
          )}
        </div>
        {detail.attachments.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {detail.attachments.map((a, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-[12px] text-foreground/80"
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
          <pre className="whitespace-pre-wrap px-4 py-5 font-sans text-[15px] leading-7 text-foreground/90 md:px-8 md:py-6">
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
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("mail.compose.title")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{t("mail.compose.from")}</Label>
            {accounts.length > 1 ? (
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.displayName
                        ? `${a.displayName} · ${a.email}`
                        : a.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                value={accounts.find((a) => a.id === accountId)?.email ?? ""}
                readOnly
              />
            )}
          </div>
          <div className={cn("grid gap-3", showCc && "sm:grid-cols-2")}>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="compose-to">{t("mail.compose.to")}</Label>
                {!showCc && (
                  <button
                    type="button"
                    onClick={() => setShowCc(true)}
                    className="text-[12px] font-medium text-muted-foreground hover:text-foreground"
                  >
                    + {t("mail.compose.addCc")}
                  </button>
                )}
              </div>
              <Input
                id="compose-to"
                type="email"
                inputMode="email"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder={t("mail.compose.toPlaceholder")}
              />
            </div>
            {showCc && (
              <div className="space-y-2">
                <Label htmlFor="compose-cc">{t("mail.compose.cc")}</Label>
                <Input
                  id="compose-cc"
                  value={cc}
                  onChange={(e) => setCc(e.target.value)}
                  placeholder={t("mail.compose.ccPlaceholder")}
                />
              </div>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="compose-subject">{t("mail.compose.subject")}</Label>
            <Input
              id="compose-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={t("mail.compose.subjectPlaceholder")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="compose-body">{t("mail.compose.body")}</Label>
            <Textarea
              id="compose-body"
              rows={10}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={t("mail.compose.bodyPlaceholder")}
            />
          </div>
          {error && <p className="text-[13px] text-destructive">{error}</p>}
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onClose} disabled={sending}>
            {t("mail.compose.discard")}
          </Button>
          <Button onClick={send} disabled={sending || !to.trim()}>
            {sending ? <Loader2 className="animate-spin" /> : <Send />}
            {t("mail.compose.send")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
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
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("mail.connect.title")}</DialogTitle>
          {preset?.hint && (
            <DialogDescription>
              {translateProviderHint(t, preset.id, preset.hint)}
            </DialogDescription>
          )}
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!busy && email && password) submit();
          }}
        >
          <div className="segmented flex w-full">
            {Object.values(PROVIDER_PRESETS).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setProvider(p.id)}
                data-active={provider === p.id}
                className="segmented-item h-9 flex-1"
              >
                {translateProviderLabel(t, p.id, p.label)}
              </button>
            ))}
          </div>

          <div className="space-y-2">
            <Label htmlFor="connect-email">{t("mail.connect.email")}</Label>
            <Input
              id="connect-email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              inputMode="email"
              autoComplete="username"
              placeholder={t("mail.connect.emailPlaceholder")}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="connect-password">
              {t("mail.connect.appPassword")}
            </Label>
            <Input
              id="connect-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              autoComplete="current-password"
              placeholder="xxxx-xxxx-xxxx-xxxx"
            />
          </div>

          {provider === "imap" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="connect-imap">
                  {t("mail.connect.imapHost")}
                </Label>
                <Input
                  id="connect-imap"
                  value={imapHost}
                  onChange={(e) => setImapHost(e.target.value)}
                  placeholder="imap.example.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="connect-smtp">
                  {t("mail.connect.smtpHost")}
                </Label>
                <Input
                  id="connect-smtp"
                  value={smtpHost}
                  onChange={(e) => setSmtpHost(e.target.value)}
                  placeholder="smtp.example.com"
                />
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
            <div className="space-y-2">
              <Label htmlFor="connect-name">
                {t("mail.connect.displayName")}
              </Label>
              <Input
                id="connect-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={t("mail.connect.displayNamePlaceholder")}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("mail.connect.color")}</Label>
              <div className="flex h-11 items-center gap-1.5">
                {(Object.keys(MAIL_ACCOUNT_COLORS) as MailAccountColor[]).map(
                  (c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      aria-label={c}
                      aria-pressed={color === c}
                      className={cn(
                        "h-6 w-6 rounded-full ring-offset-2 ring-offset-card transition-shadow",
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
          </div>

          {error && (
            <p className="rounded-[14px] bg-destructive/10 px-4 py-3 text-[13px] text-destructive">
              {error}
            </p>
          )}

          <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={busy}
            >
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={busy || !email || !password}>
              {busy && <Loader2 className="animate-spin" />}
              {busy ? t("mail.connect.verifying") : t("mail.connect.submit")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
