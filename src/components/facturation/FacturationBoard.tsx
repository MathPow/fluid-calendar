"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  FileDown,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  Plus,
  Repeat,
  Send,
  Settings2,
  Trash2,
  Upload,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import { Avatar } from "@/components/projets/ImageField";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";

import { useLocale, useT } from "@/i18n/client";
import { computeTotals, displayStatus, formatCents, formatIsoDay } from "@/lib/facturation/meta";
import { DEFAULT_PROJECT_COLOR } from "@/lib/projets/meta";
import { cn } from "@/lib/utils";

import { ImportInvoicesDialog } from "./ImportInvoicesDialog";
import { type ComposerSeed, InvoiceComposer } from "./InvoiceComposer";
import { SendInvoiceDialog } from "./SendInvoiceDialog";
import { SettingsDialog } from "./SettingsDialog";
import type {
  FactContact,
  FactOrg,
  FactSettings,
  IssuedView,
  MailAccountLite,
  RecurringView,
} from "./types";
import { todayIso } from "./types";

interface Props {
  organisations: FactOrg[];
  contacts: FactContact[];
  invoices: IssuedView[];
  recurring: RecurringView[];
  settings: Record<string, FactSettings>;
}

const ORG_KEY = "facturation.org";
type Filter = "all" | "open" | "paid" | "draft";

/** Monthly value of a contract, to sum subscriptions into a monthly figure. */
function monthlyCents(r: RecurringView): number {
  const total = computeTotals(r.lines, r.applyTaxes).subtotalCents;
  const perMonth = { weekly: 52 / 12, monthly: 1, quarterly: 1 / 3, yearly: 1 / 12 }[r.frequency];
  return Math.round((total * perMonth) / r.interval);
}

export function FacturationBoard({ organisations, contacts, invoices: initialInvoices, recurring: initialRecurring, settings: initialSettings }: Props) {
  const t = useT();
  const locale = useLocale();
  const lang = locale === "en" ? "en" : "fr";
  const money = (c: number) => formatCents(c, lang);
  const day = (d: string) => formatIsoDay(d, lang);

  const [invoices, setInvoices] = useState(initialInvoices);
  const [recurring, setRecurring] = useState(initialRecurring);
  const [settings, setSettings] = useState(initialSettings);
  const [orgId, setOrgId] = useState<string | null>(organisations[0]?.id ?? null);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [accounts, setAccounts] = useState<MailAccountLite[]>([]);
  const [composer, setComposer] = useState<ComposerSeed | null>(null);
  const [sending, setSending] = useState<IssuedView | null>(null);
  const [importFiles, setImportFiles] = useState<File[] | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(ORG_KEY);
      if (saved && organisations.some((o) => o.id === saved)) setOrgId(saved);
    } catch {
      /* private mode */
    }
  }, [organisations]);

  useEffect(() => {
    fetch("/api/mail/accounts")
      .then((r) => (r.ok ? r.json() : { accounts: [] }))
      .then((data: { accounts?: MailAccountLite[] }) => setAccounts(Array.isArray(data?.accounts) ? data.accounts : []))
      .catch(() => setAccounts([]));
  }, []);

  const org = organisations.find((o) => o.id === orgId) ?? null;
  const orgSettings = org ? settings[org.id] : null;
  const today = todayIso();

  const orgInvoices = useMemo(() => invoices.filter((i) => i.organisationId === orgId), [invoices, orgId]);
  const orgRecurring = useMemo(() => recurring.filter((r) => r.organisationId === orgId), [recurring, orgId]);
  const year = today.slice(0, 4);

  const stats = useMemo(() => {
    let open = 0;
    let overdue = 0;
    let overdueCount = 0;
    let paidYear = 0;
    for (const i of orgInvoices) {
      const s = displayStatus(i, today);
      if (s === "sent" || s === "overdue") open += i.totalCents;
      if (s === "overdue") {
        overdue += i.totalCents;
        overdueCount++;
      }
      if (s === "paid" && (i.paidAt ?? i.date).slice(0, 4) === year) paidYear += i.totalCents;
    }
    const mrr = orgRecurring.filter((r) => r.active).reduce((sum, r) => sum + monthlyCents(r), 0);
    return { open, overdue, overdueCount, paidYear, mrr };
  }, [orgInvoices, orgRecurring, today, year]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orgInvoices.filter((i) => {
      const s = displayStatus(i, today);
      if (filter === "open" && s !== "sent" && s !== "overdue") return false;
      if (filter === "paid" && s !== "paid") return false;
      if (filter === "draft" && s !== "draft") return false;
      if (!q) return true;
      return [i.party, i.number, i.description].some((v) => v?.toLowerCase().includes(q));
    });
  }, [orgInvoices, filter, search, today]);

  const refreshSettings = async (id: string) => {
    const res = await fetch(`/api/facturation/settings/${id}`);
    if (!res.ok) return;
    const s = await res.json();
    setSettings((prev) => ({ ...prev, [id]: { ...prev[id], nextNumber: s.nextNumber, mailAccountId: s.mailAccountId } }));
  };

  const upsertInvoice = (inv: IssuedView) => {
    setInvoices((prev) =>
      [inv, ...prev.filter((i) => i.id !== inv.id)].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
    );
    void refreshSettings(inv.organisationId);
  };

  const upsertRecurring = (r: RecurringView) =>
    setRecurring((prev) => [r, ...prev.filter((x) => x.id !== r.id)].sort((a, b) => Number(b.active) - Number(a.active) || a.nextRunDate.localeCompare(b.nextRunDate)));

  const markPaid = async (inv: IssuedView, paid: boolean) => {
    const res = await fetch(`/api/facturation/invoices/${inv.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: paid ? "markPaid" : "markUnpaid" }),
    });
    if (!res.ok) return toast.error(t("facturation.toasts.saveFailed"));
    upsertInvoice(await res.json());
    toast.success(paid ? t("facturation.toasts.markedPaid") : t("facturation.toasts.markedUnpaid"));
  };

  const removeInvoice = async (inv: IssuedView) => {
    if (!window.confirm(t("facturation.confirm.deleteInvoice", { number: inv.number ?? "" }))) return;
    const res = await fetch(`/api/facturation/invoices/${inv.id}`, { method: "DELETE" });
    if (!res.ok) return toast.error(t("facturation.toasts.deleteFailed"));
    setInvoices((prev) => prev.filter((i) => i.id !== inv.id));
    void refreshSettings(inv.organisationId);
  };

  const toggleRecurring = async (r: RecurringView) => {
    const res = await fetch(`/api/facturation/recurring/${r.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !r.active }),
    });
    if (!res.ok) return toast.error(t("facturation.toasts.saveFailed"));
    upsertRecurring(await res.json());
  };

  const runRecurring = async (r: RecurringView) => {
    if (!window.confirm(t(r.autoSend ? "facturation.confirm.runNowSend" : "facturation.confirm.runNow", { client: r.party }))) return;
    const res = await fetch(`/api/facturation/recurring/${r.id}/run`, { method: "POST" });
    const body = await res.json().catch(() => null);
    if (!res.ok || !body) return toast.error(body?.error || t("facturation.toasts.runFailed"));
    upsertInvoice(body.invoice);
    upsertRecurring(body.recurring);
    if (body.error) toast.warning(body.error);
    else toast.success(body.sent ? t("facturation.toasts.sent", { email: r.clientEmail ?? "" }) : t("facturation.toasts.issued"));
  };

  const removeRecurring = async (r: RecurringView) => {
    if (!window.confirm(t("facturation.confirm.deleteRecurring", { title: r.title }))) return;
    const res = await fetch(`/api/facturation/recurring/${r.id}`, { method: "DELETE" });
    if (!res.ok) return toast.error(t("facturation.toasts.deleteFailed"));
    setRecurring((prev) => prev.filter((x) => x.id !== r.id));
  };

  const openFiles = (list: FileList | null) => {
    const files = Array.from(list ?? []).filter((f) => f.type === "application/pdf" || f.type.startsWith("image/"));
    if (files.length) setImportFiles(files);
    else if (list?.length) toast.error(t("facturation.toasts.pdfOnly"));
  };

  if (!org || !orgSettings) {
    return (
      <div className="page pb-16 pt-8 md:pt-12">
        <h1 className="display text-[44px] sm:text-[64px] md:text-[80px]">{t("facturation.title")}</h1>
        <p className="mt-6 max-w-xl text-[15px] text-muted-foreground">{t("facturation.noOrg")}</p>
        <Button asChild className="mt-6">
          <a href="/fiscalite">{t("facturation.openFiscalite")}</a>
        </Button>
      </div>
    );
  }

  const statusBadge = (inv: IssuedView) => {
    const s = displayStatus(inv, today);
    const variant = { paid: "positive", overdue: "negative", sent: "tint", draft: "default", imported: "outline" }[s] as
      | "positive"
      | "negative"
      | "tint"
      | "default"
      | "outline";
    return <Badge variant={variant}>{t(`facturation.status.${s}`)}</Badge>;
  };

  const freqLabel = (r: RecurringView) =>
    r.interval === 1
      ? t(`facturation.frequency.every.${r.frequency}`)
      : t(`facturation.frequency.everyN.${r.frequency}`, { n: r.interval });

  return (
    <div
      className="page pb-16 pt-8 md:pt-12"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        openFiles(e.dataTransfer.files);
      }}
    >
      <header className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="display text-[44px] sm:text-[64px] md:text-[80px]">{t("facturation.title")}</h1>
          <div className="mt-6 flex flex-wrap gap-2">
            <Badge variant={org.registered ? "positive" : "default"} className="px-4 py-2 text-[13px]">
              {org.registered ? t("fiscalite.badge.registered") : t("fiscalite.badge.smallSupplier")}
            </Badge>
            <Badge className="px-4 py-2 text-[13px]">{t("facturation.nextNumber", { number: orgSettings.nextNumber })}</Badge>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {organisations.length > 1 && (
            <div className="segmented h-11 max-w-full overflow-x-auto">
              {organisations.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  className="segmented-item h-9"
                  data-active={o.id === orgId}
                  onClick={() => {
                    setOrgId(o.id);
                    try {
                      localStorage.setItem(ORG_KEY, o.id);
                    } catch {
                      /* private mode */
                    }
                  }}
                >
                  <Avatar
                    image={o.image}
                    fallback={o.name.charAt(0).toUpperCase()}
                    color={o.color ?? DEFAULT_PROJECT_COLOR}
                    shape="rounded"
                    className="h-5 w-5 rounded-md text-[10px]"
                  />
                  {o.name}
                </button>
              ))}
            </div>
          )}
          <Button variant="secondary" size="icon" className="h-11 w-11 rounded-full" onClick={() => setSettingsOpen(true)} aria-label={t("facturation.settings.title")}>
            <Settings2 />
          </Button>
        </div>
      </header>
      <div className="filet mt-8" />

      <div className="mt-8 flex flex-wrap gap-3">
        <Button onClick={() => setComposer({ mode: "invoice" })}>
          <Plus /> {t("facturation.actions.newInvoice")}
        </Button>
        <Button variant="secondary" onClick={() => fileInput.current?.click()}>
          <Upload /> {t("facturation.actions.import")}
        </Button>
        <input
          ref={fileInput}
          type="file"
          multiple
          accept="application/pdf,image/*"
          className="hidden"
          onChange={(e) => {
            openFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {dragging && (
        <div className="mt-6 flex flex-col items-center justify-center gap-2 rounded-tile border-2 border-dashed border-foreground bg-tint-soft px-6 py-10 text-center">
          <Upload className="h-7 w-7 text-muted-foreground" />
          <p className="text-[17px] font-semibold tracking-title">{t("facturation.drop.title")}</p>
          <p className="text-[13px] text-muted-foreground">{t("facturation.drop.hint")}</p>
        </div>
      )}

      <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t("facturation.stats.open")} value={money(stats.open)} />
        <Stat
          label={t("facturation.stats.overdue")}
          value={money(stats.overdue)}
          hint={stats.overdueCount ? t("facturation.stats.overdueCount", { count: stats.overdueCount }) : undefined}
          tone={stats.overdueCount ? "neg" : undefined}
        />
        <Stat label={t("facturation.stats.paidYear", { year })} value={money(stats.paidYear)} tone="pos" />
        <Stat label={t("facturation.stats.mrr")} value={money(stats.mrr)} hint={t("facturation.stats.mrrHint")} />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section className="tile min-w-0 p-5 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-[20px] font-bold tracking-title">{t("facturation.list.title")}</h2>
            <div className="segmented h-10 max-w-full overflow-x-auto">
              {(["all", "open", "paid", "draft"] as Filter[]).map((f) => (
                <button key={f} type="button" className="segmented-item h-8 text-[13px]" data-active={filter === f} onClick={() => setFilter(f)}>
                  {t(`facturation.filter.${f}`)}
                </button>
              ))}
            </div>
          </div>
          <Input
            className="mt-4"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("facturation.list.search")}
            aria-label={t("facturation.list.search")}
          />

          {visible.length === 0 ? (
            <p className="mt-6 text-[14px] text-muted-foreground">
              {orgInvoices.length === 0 ? t("facturation.list.emptyAll") : t("facturation.list.empty")}
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-border">
              {visible.map((inv) => {
                const s = displayStatus(inv, today);
                return (
                  <li key={inv.id} className="flex items-center gap-3 py-3">
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() =>
                        inv.generated && s === "draft"
                          ? setComposer({ mode: "invoice", invoice: inv })
                          : inv.hasFile && window.open(`/api/fiscalite/invoices/${inv.id}/file`, "_blank", "noopener")
                      }
                    >
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-[15px] font-medium">{inv.party || t("facturation.list.noClient")}</span>
                        {statusBadge(inv)}
                        {inv.recurringId && <Repeat className="h-3.5 w-3.5 text-muted-foreground" aria-label={t("facturation.list.fromRecurring")} />}
                      </span>
                      <span className="block truncate text-[12px] text-muted-foreground">
                        {[
                          inv.number ? t("facturation.list.number", { number: inv.number }) : null,
                          day(inv.date),
                          inv.dueDate && s !== "paid" ? t("facturation.list.due", { date: day(inv.dueDate) }) : null,
                          s === "paid" && inv.paidAt ? t("facturation.list.paidOn", { date: day(inv.paidAt.slice(0, 10)) }) : null,
                          inv.description,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </button>
                    <span className="shrink-0 text-right text-[15px] font-semibold tabular-nums">{money(inv.totalCents)}</span>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0 rounded-full" aria-label={t("facturation.list.actions", { number: inv.number ?? "" })}>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {inv.hasFile && (
                          <DropdownMenuItem onSelect={() => window.open(`/api/fiscalite/invoices/${inv.id}/file`, "_blank", "noopener")}>
                            <FileDown /> {t("facturation.actions.viewPdf")}
                          </DropdownMenuItem>
                        )}
                        {inv.hasFile && (
                          <DropdownMenuItem onSelect={() => setSending(inv)}>
                            <Send /> {inv.sentAt ? t("facturation.actions.resend") : t("facturation.actions.send")}
                          </DropdownMenuItem>
                        )}
                        {s !== "paid" ? (
                          <DropdownMenuItem onSelect={() => markPaid(inv, true)}>
                            <CheckCircle2 /> {t("facturation.actions.markPaid")}
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onSelect={() => markPaid(inv, false)}>
                            <CheckCircle2 /> {t("facturation.actions.markUnpaid")}
                          </DropdownMenuItem>
                        )}
                        {inv.generated && (
                          <DropdownMenuItem onSelect={() => setComposer({ mode: "invoice", invoice: inv })}>
                            <Pencil /> {t("common.edit")}
                          </DropdownMenuItem>
                        )}
                        {inv.generated && (
                          <DropdownMenuItem onSelect={() => setComposer({ mode: "invoice", duplicateOf: inv })}>
                            <Copy /> {t("facturation.actions.duplicate")}
                          </DropdownMenuItem>
                        )}
                        {inv.generated && (
                          <DropdownMenuItem onSelect={() => setComposer({ mode: "recurring", duplicateOf: inv })}>
                            <Repeat /> {t("facturation.actions.makeRecurring")}
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-negative-foreground" onSelect={() => removeInvoice(inv)}>
                          <Trash2 /> {t("common.delete")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <aside className="space-y-6">
          <section className="tile p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <p className="etiquette flex items-center gap-1.5">
                <Repeat className="h-3.5 w-3.5" /> {t("facturation.recurring.title")}
              </p>
              <Button size="sm" variant="secondary" onClick={() => setComposer({ mode: "recurring" })}>
                <Plus /> {t("common.add")}
              </Button>
            </div>
            {orgRecurring.length === 0 ? (
              <p className="mt-4 text-[13px] text-muted-foreground">{t("facturation.recurring.empty")}</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {orgRecurring.map((r) => {
                  const total = computeTotals(r.lines, r.applyTaxes).totalCents;
                  const last = r.lastInvoiceId ? invoices.find((i) => i.id === r.lastInvoiceId) : null;
                  return (
                    <li key={r.id} className={cn("rounded-2xl bg-secondary/60 p-4", !r.active && "opacity-60")}>
                      <div className="flex items-start gap-2">
                        <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setComposer({ mode: "recurring", recurring: r })}>
                          <span className="block truncate text-[15px] font-semibold tracking-title">{r.title}</span>
                          <span className="block truncate text-[13px] text-muted-foreground">
                            {r.party} · {money(total)} · {freqLabel(r)}
                          </span>
                        </button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 rounded-full" aria-label={t("facturation.recurring.actions", { title: r.title })}>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => setComposer({ mode: "recurring", recurring: r })}>
                              <Pencil /> {t("common.edit")}
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => runRecurring(r)}>
                              <Zap /> {t("facturation.actions.runNow")}
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => toggleRecurring(r)}>
                              {r.active ? <Pause /> : <Play />} {r.active ? t("facturation.actions.pause") : t("facturation.actions.resume")}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-negative-foreground" onSelect={() => removeRecurring(r)}>
                              <Trash2 /> {t("common.delete")}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {r.active ? (
                          <Badge variant="tint">{t("facturation.recurring.next", { date: day(r.nextRunDate) })}</Badge>
                        ) : (
                          <Badge>{t("facturation.recurring.paused")}</Badge>
                        )}
                        <Badge variant={r.autoSend ? "positive" : "default"}>
                          {r.autoSend ? t("facturation.recurring.autoSend", { email: r.clientEmail ?? "—" }) : t("facturation.recurring.manualSend")}
                        </Badge>
                        {r.endDate && <Badge>{t("facturation.recurring.until", { date: day(r.endDate) })}</Badge>}
                      </div>
                      {last && (
                        <p className="mt-2 text-[12px] text-muted-foreground">
                          {t("facturation.recurring.last", { number: last.number ?? "", date: day(last.date) })}
                        </p>
                      )}
                      {r.lastError && (
                        <p className="mt-2 flex items-start gap-1.5 text-[12px] text-pending-foreground">
                          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> {r.lastError}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </aside>
      </div>

      {composer && (
        <InvoiceComposer
          seed={composer}
          onClose={() => setComposer(null)}
          organisation={org}
          settings={orgSettings}
          contacts={contacts}
          invoices={orgInvoices}
          accounts={accounts}
          onSavedInvoice={(inv, thenSend) => {
            upsertInvoice(inv);
            setComposer(null);
            if (thenSend) setSending(inv);
          }}
          onSavedRecurring={(r) => {
            upsertRecurring(r);
            setComposer(null);
          }}
        />
      )}
      {sending && (
        <SendInvoiceDialog
          invoice={sending}
          organisation={org}
          settings={orgSettings}
          accounts={accounts}
          onClose={() => setSending(null)}
          onSent={(inv) => {
            upsertInvoice(inv);
            setSending(null);
          }}
        />
      )}
      {importFiles && (
        <ImportInvoicesDialog
          files={importFiles}
          organisation={org}
          contacts={contacts}
          onClose={() => setImportFiles(null)}
          onImported={(rows) => {
            rows.forEach(upsertInvoice);
            setImportFiles(null);
          }}
        />
      )}
      {settingsOpen && (
        <SettingsDialog
          organisation={org}
          settings={orgSettings}
          accounts={accounts}
          onClose={() => setSettingsOpen(false)}
          onSaved={(s) => {
            setSettings((prev) => ({ ...prev, [org.id]: s }));
            setSettingsOpen(false);
          }}
        />
      )}
    </div>
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "neg" | "pos" }) {
  return (
    <div className="tile p-4 sm:p-5">
      <p className="text-[12px] text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-2 text-[20px] font-bold tabular-nums tracking-title sm:text-[24px]",
          tone === "neg" && "text-negative-foreground",
          tone === "pos" && "text-positive-foreground"
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
