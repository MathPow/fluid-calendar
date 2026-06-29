"use client";

import { useCallback, useEffect, useState } from "react";

import {
  AlertCircle,
  Inbox,
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

import { PROVIDER_PRESETS } from "@/lib/mail/providers";
import { cn } from "@/lib/utils";

import { accountVisibleInStation, useStationStore } from "@/store/station";

interface Account {
  id: string;
  provider: string;
  displayName: string | null;
  email: string;
  station?: string | null;
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

const fmtAddr = (a: Address[]) =>
  a.map((x) => x.name || x.address || "").filter(Boolean).join(", ") ||
  "(unknown)";

const fmtDate = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay
    ? d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

export function EmailClient() {
  const currentStation = useStationStore((s) => s.currentStation);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [folders, setFolders] = useState<string[]>([]);
  const [mailbox, setMailbox] = useState("INBOX");

  const [messages, setMessages] = useState<MessageSummary[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [selectedUid, setSelectedUid] = useState<number | null>(null);
  const [detail, setDetail] = useState<MessageDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [initializing, setInitializing] = useState(true);
  const [showConnect, setShowConnect] = useState(false);
  const [compose, setCompose] = useState<ComposeState | null>(null);

  const loadAccounts = useCallback(async () => {
    const res = await fetch("/api/mail/accounts");
    const data = res.ok ? await res.json() : { accounts: [] };
    setAccounts(data.accounts ?? []);
    return data.accounts as Account[];
  }, []);

  const loadMessages = useCallback(
    async (acctId: string, box: string, q: string, withFolders: boolean) => {
      setLoadingList(true);
      setListError(null);
      try {
        const params = new URLSearchParams({
          accountId: acctId,
          mailbox: box,
          limit: "40",
        });
        if (q.trim()) params.set("q", q.trim());
        if (withFolders) params.set("folders", "1");
        const res = await fetch(`/api/mail/messages?${params}`);
        if (!res.ok) {
          const e = await res.json().catch(() => ({}));
          throw new Error(e.error || "Failed to load mail");
        }
        const data = await res.json();
        setMessages(data.messages ?? []);
        if (data.folders) setFolders(data.folders);
      } catch (err) {
        setListError(err instanceof Error ? err.message : "Failed to load mail");
        setMessages([]);
      } finally {
        setLoadingList(false);
      }
    },
    []
  );

  // Initial load — pick the first account visible under the active station.
  useEffect(() => {
    (async () => {
      const accts = await loadAccounts();
      const station = useStationStore.getState().currentStation;
      const first =
        accts.find((a) => accountVisibleInStation(a.station, station)) ??
        accts[0];
      if (first) {
        setAccountId(first.id);
        await loadMessages(first.id, "INBOX", "", true);
      }
      setInitializing(false);
    })();
  }, [loadAccounts, loadMessages]);

  const switchAccount = async (id: string) => {
    setAccountId(id);
    setMailbox("INBOX");
    setSelectedUid(null);
    setDetail(null);
    setSearch("");
    setFolders([]);
    await loadMessages(id, "INBOX", "", true);
  };

  // Accounts shown under the active station (untagged always show).
  const visibleAccounts = accounts.filter((a) =>
    accountVisibleInStation(a.station, currentStation)
  );

  // If switching station hides the open account, jump to a visible one.
  useEffect(() => {
    if (initializing || accounts.length === 0) return;
    if (accountId && visibleAccounts.some((a) => a.id === accountId)) return;
    const next = visibleAccounts[0];
    if (next) {
      switchAccount(next.id);
    } else {
      setAccountId(null);
      setMessages([]);
      setSelectedUid(null);
      setDetail(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStation]);

  const switchMailbox = async (box: string) => {
    if (!accountId) return;
    setMailbox(box);
    setSelectedUid(null);
    setDetail(null);
    await loadMessages(accountId, box, search, false);
  };

  const selectMessage = async (uid: number) => {
    if (!accountId) return;
    setSelectedUid(uid);
    setDetail(null);
    setLoadingDetail(true);
    try {
      const params = new URLSearchParams({ accountId, mailbox });
      const res = await fetch(`/api/mail/messages/${uid}?${params}`);
      if (!res.ok) throw new Error("Failed to load message");
      const data = await res.json();
      setDetail(data.message);
      // Optimistically mark read in the list.
      setMessages((prev) =>
        prev.map((m) => (m.uid === uid ? { ...m, seen: true } : m))
      );
    } catch {
      setDetail(null);
    } finally {
      setLoadingDetail(false);
    }
  };

  const runSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (accountId) loadMessages(accountId, mailbox, search, false);
  };

  const startReply = (m: MessageDetail) => {
    const original = m.text || "";
    const quoted = original
      .split("\n")
      .map((l) => `> ${l}`)
      .join("\n");
    setCompose({
      to: m.from[0]?.address || "",
      cc: "",
      subject: m.subject.startsWith("Re:") ? m.subject : `Re: ${m.subject}`,
      body: `\n\n----\n${quoted}`,
      inReplyTo: m.messageId || undefined,
      references: [...m.references, ...(m.messageId ? [m.messageId] : [])],
    });
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
          <h1 className="mt-4 text-xl font-semibold">Connect your mailbox</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Add your iCloud or Zoho account to read and reply to mail right here.
          </p>
          <button
            onClick={() => setShowConnect(true)}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" /> Connect account
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

  return (
    <div className="flex h-full">
      {/* Rail: accounts + folders */}
      <div className="flex w-56 flex-none flex-col border-r border-border bg-card">
        <div className="p-3">
          <button
            onClick={() =>
              setCompose({ to: "", cc: "", subject: "", body: "" })
            }
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <PenSquare className="h-4 w-4" /> Compose
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-2">
          {folders.length > 0 ? (
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
                    <span className="truncate">{f}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex items-center gap-2 px-2 py-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Loading folders…
            </div>
          )}
        </div>

        {/* Account switcher (filtered by the active station) */}
        <div className="border-t border-border p-2">
          {visibleAccounts.length === 0 && accounts.length > 0 && (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">
              No accounts in this station.
            </p>
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
              <Mail className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{a.email}</span>
            </button>
          ))}
          <button
            onClick={() => setShowConnect(true)}
            className="mt-1 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent"
          >
            <Plus className="h-3.5 w-3.5" /> Add account
          </button>
        </div>
      </div>

      {/* Message list */}
      <div className="flex w-80 flex-none flex-col border-r border-border">
        <form
          onSubmit={runSearch}
          className="flex items-center gap-2 border-b border-border px-3 py-2"
        >
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${mailbox}…`}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <button
            type="button"
            onClick={() =>
              accountId && loadMessages(accountId, mailbox, search, false)
            }
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Refresh"
          >
            <RefreshCw className={cn("h-4 w-4", loadingList && "animate-spin")} />
          </button>
        </form>

        <div className="flex-1 overflow-y-auto">
          {loadingList ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : listError ? (
            <div className="flex flex-col items-center gap-2 px-4 py-8 text-center text-sm text-destructive">
              <AlertCircle className="h-5 w-5" />
              {listError}
            </div>
          ) : messages.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              No messages.
            </p>
          ) : (
            <ul>
              {messages.map((m) => (
                <li key={m.uid}>
                  <button
                    onClick={() => selectMessage(m.uid)}
                    className={cn(
                      "flex w-full flex-col gap-0.5 border-b border-border px-3 py-2.5 text-left",
                      selectedUid === m.uid
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
                        {fmtAddr(m.from)}
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
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Reading pane */}
      <div className="min-w-0 flex-1 overflow-y-auto">
        {!selectedUid ? (
          <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground">
            <Mail className="h-10 w-10 opacity-40" />
            <p className="mt-3 text-sm">
              Select a message{activeAccount ? ` in ${activeAccount.email}` : ""}.
            </p>
          </div>
        ) : loadingDetail ? (
          <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading message…
          </div>
        ) : !detail ? (
          <div className="flex h-full items-center justify-center text-sm text-destructive">
            Couldn&apos;t load that message.
          </div>
        ) : (
          <MessageView detail={detail} onReply={() => startReply(detail)} />
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

      {compose && accountId && (
        <ComposeModal
          accountId={accountId}
          fromEmail={activeAccount?.email ?? ""}
          initial={compose}
          onClose={() => setCompose(null)}
        />
      )}
    </div>
  );
}

function MessageView({
  detail,
  onReply,
}: {
  detail: MessageDetail;
  onReply: () => void;
}) {
  return (
    <article className="flex h-full flex-col">
      <div className="border-b border-border p-5">
        <div className="mb-3 flex items-start justify-between gap-4">
          <h1 className="text-lg font-semibold">{detail.subject}</h1>
          <button
            onClick={onReply}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-accent"
          >
            <Reply className="h-4 w-4" /> Reply
          </button>
        </div>
        <div className="space-y-0.5 text-sm">
          <p>
            <span className="text-muted-foreground">From </span>
            {fmtAddr(detail.from)}
          </p>
          <p>
            <span className="text-muted-foreground">To </span>
            {fmtAddr(detail.to)}
            {detail.cc.length > 0 && ` · Cc ${fmtAddr(detail.cc)}`}
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
            title="Message body"
            sandbox=""
            className="h-full w-full bg-white"
            srcDoc={detail.html}
          />
        ) : (
          <pre className="whitespace-pre-wrap p-5 font-sans text-sm leading-7 text-foreground/90">
            {detail.text || "(empty message)"}
          </pre>
        )}
      </div>
    </article>
  );
}

interface ComposeState {
  to: string;
  cc: string;
  subject: string;
  body: string;
  inReplyTo?: string;
  references?: string[];
}

function ComposeModal({
  accountId,
  fromEmail,
  initial,
  onClose,
}: {
  accountId: string;
  fromEmail: string;
  initial: ComposeState;
  onClose: () => void;
}) {
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
        throw new Error(e.error || "Failed to send");
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-6">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-t-xl border border-border bg-card shadow-xl sm:rounded-xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">New message</h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-px overflow-y-auto">
          <Field label="From" value={fromEmail} readOnly />
          <FieldInput label="To" value={to} onChange={setTo} placeholder="recipient@example.com" />
          {showCc ? (
            <FieldInput label="Cc" value={cc} onChange={setCc} placeholder="cc@example.com" />
          ) : (
            <button
              onClick={() => setShowCc(true)}
              className="px-4 py-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              + Add Cc
            </button>
          )}
          <FieldInput
            label="Subject"
            value={subject}
            onChange={setSubject}
            placeholder="Subject"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write your message…"
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
            Discard
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
            Send
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
  const [provider, setProvider] = useState("icloud");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
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
          ...(provider === "imap" ? { imapHost, smtpHost } : {}),
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Couldn't connect");
      }
      onConnected();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't connect");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">Connect a mailbox</h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
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
                {p.label}
              </button>
            ))}
          </div>

          {preset?.hint && (
            <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              {preset.hint}
            </p>
          )}

          <Labeled label="Email address">
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              placeholder="you@icloud.com"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </Labeled>

          <Labeled label="App-specific password">
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
              <Labeled label="IMAP host">
                <input
                  value={imapHost}
                  onChange={(e) => setImapHost(e.target.value)}
                  placeholder="imap.example.com"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </Labeled>
              <Labeled label="SMTP host">
                <input
                  value={smtpHost}
                  onChange={(e) => setSmtpHost(e.target.value)}
                  placeholder="smtp.example.com"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </Labeled>
            </div>
          )}

          <Labeled label="Display name (optional)">
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your Name"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </Labeled>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <button
            onClick={submit}
            disabled={busy || !email || !password}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {busy ? "Verifying…" : "Connect"}
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
