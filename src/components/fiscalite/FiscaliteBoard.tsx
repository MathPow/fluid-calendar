"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { useSearchParams } from "next/navigation";

import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  FilePlus2,
  Paperclip,
  Pencil,
  SlidersHorizontal,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { Avatar } from "@/components/projets/ImageField";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";

import { useLocale, useT } from "@/i18n/client";
import { cn } from "@/lib/utils";

import {
  type Budgets,
  DEFAULT_PROFILE,
  isPersonal,
  FILING_FREQUENCY_KEYS,
  LEGAL_FORM_KEYS,
  PAID_BY_ME,
  PAID_BY_ME_KEY,
  SMALL_SUPPLIER_LIMIT_CENTS,
  deadlinesFor,
  fiscalYearOf,
  fiscalYearRange,
  formatDay,
  formatMoney,
  invoiceIssues,
  partnerSummaries,
  smallSupplierTest,
  summarize,
  tCategoryLabel,
} from "@/lib/fiscalite/meta";
import type { FilingFrequency, LegalForm } from "@/lib/fiscalite/meta";
import type { InvoiceView, MovementView } from "@/lib/fiscalite/queries";
import { INVOICE_MIMES, MAX_INVOICE_BYTES } from "@/lib/fiscalite/schemas";
import { DEFAULT_PROJECT_COLOR } from "@/lib/projets/meta";

import { ExcelActions, ImportDialog, SPREADSHEET_ACCEPT, isSpreadsheet } from "./ExcelActions";
import { InvoiceDialog } from "./InvoiceDialog";
import { PersonalBudget } from "./PersonalBudget";
import { PartnersTile } from "./PartnersTile";
import { COMPANY_FIELDS, type ProfileView, TaxProfileDialog } from "./TaxProfileDialog";

interface Org {
  id: string;
  name: string;
  color: string | null;
  image: string | null;
  kind: string;
}

interface FiscaliteBoardProps {
  organisations: Org[];
  profiles: ProfileView[];
  invoices: InvoiceView[];
  movements: MovementView[];
}

const ORG_KEY = "fiscalite.org";

/**
 * The Fiscalité tab: pick a company, drop its invoices, and read the guide
 * (deadlines, TPS/TVQ to remit, small-supplier threshold, what to fix).
 */
export function FiscaliteBoard({
  organisations: allOrgs,
  profiles: initialProfiles,
  invoices: initial,
  movements: initialMovements,
}: FiscaliteBoardProps) {
  const t = useT();
  const locale = useLocale();
  const paidByLabelI18n = (paidBy: string | null | undefined) =>
    paidBy === PAID_BY_ME ? t(PAID_BY_ME_KEY) : paidBy || null;
  // Custom spreadsheet categories have no key: keep their own label.
  const byCategoryLabel = (id: string, label: string) => {
    const translated = tCategoryLabel(t, "depense", id);
    return translated === id ? label : translated;
  };
  const [invoices, setInvoices] = useState(initial);
  const [profiles, setProfiles] = useState(initialProfiles);
  const [movements, setMovements] = useState(initialMovements);
  // Server refreshes (after an Excel import) replace the local copies.
  useEffect(() => setInvoices(initial), [initial]);
  useEffect(() => setProfiles(initialProfiles), [initialProfiles]);
  useEffect(() => setMovements(initialMovements), [initialMovements]);
  // Only the organisations flagged for Fiscalité (run for profit) get a tab.
  const organisations = useMemo(
    () => allOrgs.filter((o) => profiles.some((p) => p.organisationId === o.id && p.tracked)),
    [allOrgs, profiles]
  );
  const [orgId, setOrgId] = useState<string | null>(organisations[0]?.id ?? null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | "depense" | "revenu">("all");
  const [dragging, setDragging] = useState(false);
  const [dialog, setDialog] = useState<{ open: boolean; invoice?: InvoiceView | null; file?: File | null }>({
    open: false,
  });
  const [profileOpen, setProfileOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  // Files dropped together, handled one after the other: a receipt opens the
  // invoice dialog, a spreadsheet the import preview.
  const [queue, setQueue] = useState<File[]>([]);
  const [importFile, setImportFile] = useState<File | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(ORG_KEY);
      if (saved && organisations.some((o) => o.id === saved)) setOrgId(saved);
    } catch {}
  }, [organisations]);
  // Unflagging the company on screen moves to the next one.
  useEffect(() => {
    if (!organisations.some((o) => o.id === orgId)) setOrgId(organisations[0]?.id ?? null);
  }, [organisations, orgId]);
  const pickOrg = (id: string) => {
    setOrgId(id);
    try {
      localStorage.setItem(ORG_KEY, id);
    } catch {}
  };
  // ?org= from the search palette (an invoice result) opens that company.
  const urlOrg = useSearchParams().get("org");
  useEffect(() => {
    if (urlOrg && organisations.some((o) => o.id === urlOrg)) setOrgId(urlOrg);
  }, [urlOrg, organisations]);

  const org = organisations.find((o) => o.id === orgId) ?? null;
  const savedProfile = profiles.find((p) => p.organisationId === orgId) ?? null;
  const profile = useMemo(
    () =>
      savedProfile ?? {
        ...DEFAULT_PROFILE,
        // The personal bucket starts as a budget, not a business.
        legalForm: org?.kind === "perso" ? "personnel" : DEFAULT_PROFILE.legalForm,
        organisationId: orgId ?? "",
        notes: null,
        tracked: true,
        setUp: false,
        partners: [] as string[],
        partnerShares: [] as number[],
        startedAt: null,
        ...(Object.fromEntries(COMPANY_FIELDS.map((f) => [f, f === "province" ? "QC" : null])) as Record<
          (typeof COMPANY_FIELDS)[number],
          string | null
        >),
      },
    [savedProfile, orgId, org?.kind]
  );
  const personal = isPersonal(profile);
  const configured = !!savedProfile?.setUp;
  const missingIdentity = [
    !profile.legalName && t("fiscalite.identity.legalName"),
    !profile.neq && t("fiscalite.identity.neq"),
    profile.salesTaxStatus === "inscrit" && !profile.gstNumber && t("fiscalite.identity.gstNumber"),
    profile.salesTaxStatus === "inscrit" && !profile.qstNumber && t("fiscalite.identity.qstNumber"),
    !profile.address && t("fiscalite.identity.address"),
  ].filter((v): v is string => !!v);

  const setTracked = async (organisationId: string, tracked: boolean) => {
    try {
      const res = await fetch(`/api/fiscalite/profiles/${organisationId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tracked }),
      });
      const data = (await res.json().catch(() => ({}))) as ProfileView & { error?: string };
      if (!res.ok) throw new Error(data.error || t("common.error", { status: res.status }));
      setProfiles((prev) => [...prev.filter((p) => p.organisationId !== organisationId), data]);
      if (tracked) pickOrg(organisationId);
    } catch (e) {
      toast.error(t("toasts.fiscalite.updateFailed"), {
        description: e instanceof Error ? e.message : undefined,
      });
    }
  };
  const picker = (
    <OrgPicker
      organisations={allOrgs}
      isTracked={(id) => organisations.some((o) => o.id === id)}
      invoiceCount={(id) => invoices.filter((i) => i.organisationId === id).length}
      onChange={setTracked}
    />
  );

  const orgInvoices = useMemo(() => invoices.filter((i) => i.organisationId === orgId), [invoices, orgId]);

  const currentYear = fiscalYearOf(profile, new Date());
  const [year, setYear] = useState(currentYear);
  useEffect(() => setYear(currentYear), [orgId, currentYear]);
  const range = fiscalYearRange(profile, year);

  const yearInvoices = useMemo(
    () => orgInvoices.filter((i) => fiscalYearOf(profile, new Date(i.date)) === year),
    [orgInvoices, profile, year]
  );
  const summary = useMemo(() => summarize(yearInvoices, profile), [yearInvoices, profile]);
  const supplier = useMemo(() => smallSupplierTest(orgInvoices), [orgInvoices]);
  const registered = profile.salesTaxStatus === "inscrit";
  const senc = profile.legalForm === "senc";
  const yearMovements = useMemo(
    () =>
      movements
        .filter((m) => m.organisationId === orgId && fiscalYearOf(profile, new Date(m.date)) === year)
        .sort((a, b) => b.date.localeCompare(a.date)),
    [movements, orgId, profile, year]
  );
  const partnerRows = useMemo(
    () =>
      partnerSummaries(
        profile.partners ?? [],
        yearInvoices,
        yearMovements,
        summary.profitCents,
        profile.partnerShares ?? []
      ),
    [profile.partners, profile.partnerShares, yearInvoices, yearMovements, summary.profitCents]
  );

  const deadlines = useMemo(() => {
    const now = Date.now() - 86_400_000;
    return [...deadlinesFor(profile, year - 1), ...deadlinesFor(profile, year), ...deadlinesFor(profile, year + 1)]
      .filter((d) => d.date.getTime() >= now)
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      // Instalments repeat every quarter: the next one is enough.
      .filter((d, i, all) => d.kind !== "acompte" || all.findIndex((x) => x.kind === "acompte") === i)
      .slice(0, 5);
  }, [profile, year]);

  const issuesById = useMemo(
    () => new Map(yearInvoices.map((i) => [i.id, invoiceIssues(i, profile)])),
    [yearInvoices, profile]
  );
  const warnCount = Array.from(issuesById.values()).filter((l) => l.some((i) => i.level === "warn")).length;

  const visible = yearInvoices.filter((i) => filter === "all" || i.direction === filter);

  const openFiles = (list: FileList | File[] | null | undefined) => {
    if (!list || !org) return;
    const ok: File[] = [];
    const rejected: string[] = [];
    for (const file of Array.from(list)) {
      if (isSpreadsheet(file)) {
        if (file.size > 10 * 1024 * 1024) rejected.push(`${file.name} (10 Mo max)`);
        else ok.push(file);
      } else if (INVOICE_MIMES.includes(file.type)) {
        if (file.size > MAX_INVOICE_BYTES) rejected.push(`${file.name} (15 Mo max)`);
        else ok.push(file);
      } else rejected.push(file.name);
    }
    if (rejected.length) {
      toast.error(t("toasts.fiscalite.filesIgnored"), {
        description: t("toasts.fiscalite.filesIgnored.description", { files: rejected.join(", ") }),
      });
    }
    if (ok.length > 1) toast(t("toasts.fiscalite.oneAtATime", { count: ok.length }));
    setQueue((q) => [...q, ...ok]);
  };

  // Next file in line once nothing is open.
  useEffect(() => {
    if (!queue.length || dialog.open || importFile) return;
    const [next, ...rest] = queue;
    setQueue(rest);
    if (isSpreadsheet(next)) setImportFile(next);
    else setDialog({ open: true, file: next, invoice: null });
  }, [queue, dialog.open, importFile]);

  if (!org) {
    return (
      <div className="page pb-16 pt-8 md:pt-12">
        <h1 className="display text-[44px] sm:text-[64px] md:text-[80px]">{t("fiscalite.board.title")}</h1>
        <p className="mt-6 max-w-xl text-muted-foreground">
          {allOrgs.length
            ? t("fiscalite.board.pickProfitEmpty")
            : t("fiscalite.board.createOrgFirst")}
        </p>
        {allOrgs.length > 0 && <div className="tile mt-8 max-w-xl p-4">{picker}</div>}
      </div>
    );
  }

  const netGst = summary.gstCollected - summary.itc;
  const netQst = summary.qstCollected - summary.itr;
  // Expenses I paid out of pocket this year: what the company owes me.
  const paidByMeCents = yearInvoices
    .filter((i) => i.direction === "depense" && i.paidBy === PAID_BY_ME)
    .reduce((sum, i) => sum + i.totalCents, 0);

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
          <h1 className="display text-[44px] sm:text-[64px] md:text-[80px]">{t("fiscalite.board.title")}</h1>
          <div className="mt-6 flex flex-wrap gap-2">
            <Badge className="px-4 py-2 text-[13px]">
              {t(LEGAL_FORM_KEYS[profile.legalForm as LegalForm]?.label ?? "fiscalite.legalForm.individuelle.label")}
            </Badge>
            {!personal && (
              <Badge variant={registered ? "positive" : "default"} className="px-4 py-2 text-[13px]">
                {registered ? t("fiscalite.badge.registered") : t("fiscalite.badge.smallSupplier")}
              </Badge>
            )}
            {warnCount > 0 && (
              <Badge variant="pending" className="px-4 py-2 text-[13px]">
                {t("fiscalite.badge.invoicesToFix", { count: warnCount })}
              </Badge>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="segmented h-11">
            {organisations.map((o) => (
              <button
                key={o.id}
                type="button"
                className="segmented-item h-9"
                data-active={o.id === orgId}
                onClick={() => pickOrg(o.id)}
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
          <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <PopoverTrigger asChild>
              <Button variant="secondary" size="icon" className="h-11 w-11 rounded-full" aria-label={t("fiscalite.board.pickOrgs")}>
                <SlidersHorizontal />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 p-3">
              <p className="etiquette px-2 pb-2 pt-1">{t("fiscalite.board.profitOrgs")}</p>
              {picker}
            </PopoverContent>
          </Popover>
          {/* The budget has its own month picker. */}
          <div className={cn("segmented h-11", personal && "hidden")}>
            <button type="button" className="segmented-item h-9 px-2" onClick={() => setYear(year - 1)} aria-label={t("fiscalite.board.prevYear")}>
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="px-2 text-[14px] font-semibold tabular-nums">
              {profile.legalForm === "societe" && profile.fiscalYearEnd !== "12-31" ? t("fiscalite.board.fiscalYear", { year }) : year}
            </span>
            <button type="button" className="segmented-item h-9 px-2" onClick={() => setYear(year + 1)} aria-label={t("fiscalite.board.nextYear")}>
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>
      <div className="filet mt-8" />

      {/* Drop zone */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => fileInput.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && fileInput.current?.click()}
        className={cn(
          "mt-8 flex cursor-pointer flex-col items-center justify-center gap-3 rounded-tile border-2 border-dashed px-6 py-10 text-center transition-colors",
          dragging ? "border-foreground bg-tint-soft" : "border-border hover:border-foreground/40 hover:bg-secondary/50"
        )}
      >
        <Upload className="h-7 w-7 text-muted-foreground" />
        <div>
          <p className="text-[17px] font-semibold tracking-title">
            {personal ? t("fiscalite.drop.personal.title", { org: org.name }) : t("fiscalite.drop.business.title", { org: org.name })}
          </p>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {personal
              ? t("fiscalite.drop.personal.hint")
              : t("fiscalite.drop.business.hint")}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={(e) => {
              e.stopPropagation();
              setDialog({ open: true, invoice: null, file: null });
            }}
          >
            <FilePlus2 /> {t("fiscalite.drop.manualEntry")}
          </Button>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept={`${INVOICE_MIMES.join(",")},${SPREADSHEET_ACCEPT}`}
          multiple
          className="hidden"
          onChange={(e) => {
            openFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {personal ? (
        <PersonalBudget
          organisation={org}
          invoices={orgInvoices}
          budgets={(savedProfile?.budgets as Budgets | null | undefined) ?? {}}
          onOpenInvoice={(invoice) => setDialog({ open: true, invoice, file: null })}
          onAdd={() => setDialog({ open: true, invoice: null, file: null })}
          onEditProfile={() => setProfileOpen(true)}
          onBudgetsSaved={(budgets) =>
            setProfiles((prev) => {
              const base = prev.find((p) => p.organisationId === profile.organisationId) ?? {
                ...profile,
                legalForm: "personnel",
              };
              return [...prev.filter((p) => p.organisationId !== profile.organisationId), { ...base, budgets }];
            })
          }
        />
      ) : (
      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-6">
          {/* Year at a glance */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label={t("fiscalite.stat.revenue")} value={formatMoney(summary.revenueCents, { locale })} />
            <Stat
              label={t("fiscalite.stat.deductible")}
              value={formatMoney(summary.deductibleCents, { locale })}
              hint={summary.capitalCents ? t("fiscalite.stat.deductible.hint", { amount: formatMoney(summary.capitalCents, { locale }) }) : undefined}
            />
            <Stat
              label={t("fiscalite.stat.profit")}
              value={formatMoney(summary.profitCents, { locale })}
              tone={summary.profitCents < 0 ? "neg" : undefined}
            />
            {registered ? (
              <Stat
                label={t("fiscalite.stat.taxesDue")}
                value={formatMoney(netGst + netQst, { locale })}
                hint={t("fiscalite.stat.taxesDue.hint", { gst: formatMoney(netGst, { locale }), qst: formatMoney(netQst, { locale }) })}
                tone={netGst + netQst < 0 ? "pos" : undefined}
              />
            ) : (
              <Stat
                label={t("fiscalite.stat.taxesPaid")}
                value={formatMoney(summary.gstPaid + summary.qstPaid, { locale })}
                hint={t("fiscalite.stat.taxesPaid.hint")}
              />
            )}
          </div>
          {paidByMeCents > 0 && (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat
                label={t("fiscalite.stat.paidByMe")}
                value={formatMoney(paidByMeCents, { locale })}
                hint={
                  profile.legalForm === "societe"
                    ? t("fiscalite.stat.paidByMe.hint.societe")
                    : t("fiscalite.stat.paidByMe.hint.individuelle")
                }
              />
            </div>
          )}
          <p className="text-[12px] text-muted-foreground">
            {formatDay(range.start, { locale })} → {formatDay(range.end, { locale })} · {t("fiscalite.board.invoiceCount", { count: yearInvoices.length })}
          </p>

          {/* Invoice list */}
          <section className="tile p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-[20px] font-bold tracking-title">{t("fiscalite.invoices.title")}</h2>
                <ExcelActions organisation={org} year={year} />
              </div>
              <div className="segmented">
                {(
                  [
                    ["all", t("fiscalite.filter.all")],
                    ["depense", t("fiscalite.filter.expenses")],
                    ["revenu", t("fiscalite.filter.incomes")],
                  ] as const
                ).map(([id, label]) => (
                  <button key={id} type="button" className="segmented-item" data-active={filter === id} onClick={() => setFilter(id as "all" | "depense" | "revenu")}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {visible.length === 0 ? (
              <p className="mt-6 text-[14px] text-muted-foreground">
                {t("fiscalite.invoices.empty")}
              </p>
            ) : (
              <ul className="mt-4 divide-y divide-border">
                {visible.map((inv) => {
                  const issues = issuesById.get(inv.id) ?? [];
                  const warn = issues.filter((i) => i.level === "warn");
                  const income = inv.direction === "revenu";
                  return (
                    <li key={inv.id}>
                      <button
                        type="button"
                        onClick={() => setDialog({ open: true, invoice: inv, file: null })}
                        className="group flex w-full items-center gap-3 py-3 text-left"
                      >
                        <span
                          className={cn(
                            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                            income ? "bg-positive text-positive-foreground" : "bg-secondary text-muted-foreground"
                          )}
                        >
                          {income ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5 truncate text-[15px] font-medium">
                            {inv.party || inv.description || t("fiscalite.invoices.untitled")}
                            {inv.file && <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                          </span>
                          <span className="block truncate text-[12px] text-muted-foreground">
                            {formatDay(new Date(inv.date), { short: true, locale })} · {tCategoryLabel(t, inv.direction, inv.category)}
                            {inv.number ? ` · ${t("fiscalite.invoices.number", { number: inv.number })}` : ""}
                            {inv.paidBy ? ` · ${t("fiscalite.invoices.paidBy", { who: paidByLabelI18n(inv.paidBy) ?? "" })}` : ""}
                          </span>
                          {warn.length > 0 && (
                            <span className="mt-1 flex items-center gap-1 text-[12px] text-pending-foreground">
                              <AlertTriangle className="h-3 w-3 shrink-0" />
                              <span className="truncate">{warn[0].key ? t(warn[0].key, warn[0].params) : warn[0].text}</span>
                            </span>
                          )}
                        </span>
                        <span className="text-right">
                          <span className={cn("block text-[15px] font-semibold tabular-nums", income && "text-positive-foreground")}>
                            {income ? "+" : "−"}
                            {formatMoney(inv.totalCents, { locale })}
                          </span>
                          {inv.gstCents + inv.qstCents > 0 && (
                            <span className="block text-[11px] tabular-nums text-muted-foreground">
                              {t("fiscalite.invoices.taxes", { amount: formatMoney(inv.gstCents + inv.qstCents, { locale }) })}
                            </span>
                          )}
                        </span>
                        <Pencil className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {summary.byCategory.length > 0 && (
            <section className="tile p-5 sm:p-6">
              <h2 className="text-[20px] font-bold tracking-title">{t("fiscalite.byCategory.title")}</h2>
              <p className="mt-1 text-[13px] text-muted-foreground">
                {profile.legalForm === "societe"
                  ? t("fiscalite.byCategory.hint.societe")
                  : t("fiscalite.byCategory.hint.individuelle")}
              </p>
              <ul className="mt-4 space-y-2">
                {summary.byCategory.map((c) => (
                  <li key={c.id} className="flex items-baseline gap-3 text-[14px]">
                    <span className="w-12 shrink-0 text-[12px] tabular-nums text-muted-foreground">{c.line ?? ""}</span>
                    <span className="min-w-0 flex-1 truncate">{byCategoryLabel(c.id, c.label)}</span>
                    {c.deductibleCents !== c.cents && (
                      <span className="text-[12px] tabular-nums text-muted-foreground">
                        {formatMoney(c.cents, { locale })} →
                      </span>
                    )}
                    <span className="font-medium tabular-nums">{formatMoney(c.deductibleCents || c.cents, { locale })}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        {/* Guide */}
        <aside className={cn("space-y-6", !configured && "order-first lg:order-none")}>
          {!configured ? (
            <section className="tile-ink p-6">
              <p className="etiquette text-background/60">{t("fiscalite.setup.step")}</p>
              <h2 className="mt-3 text-[22px] font-bold leading-tight tracking-title">
                {t("fiscalite.setup.title", { org: org.name })}
              </h2>
              <p className="mt-2 text-[14px] text-background/70">
                {t("fiscalite.setup.hint")}
              </p>
              <Button variant="secondary" className="mt-5" onClick={() => setProfileOpen(true)}>
                {t("fiscalite.setup.fill")}
              </Button>
            </section>
          ) : (
            <section className="tile p-6">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="etiquette">{t("fiscalite.profile.title")}</p>
                  <h2 className="mt-2 truncate text-[18px] font-bold tracking-title">
                    {profile.legalName || org.name}
                  </h2>
                  <p className="text-[13px] text-muted-foreground">
                    {LEGAL_FORM_KEYS[profile.legalForm as LegalForm] ? t(LEGAL_FORM_KEYS[profile.legalForm as LegalForm].label) : ""}
                    {profile.activity ? ` · ${profile.activity}` : ""}
                  </p>
                </div>
                <Button size="sm" variant="secondary" onClick={() => setProfileOpen(true)}>
                  <Pencil /> {t("common.edit")}
                </Button>
              </div>
              <dl className="mt-4 space-y-1.5 text-[13px]">
                {profile.neq && <Row k="NEQ">{profile.neq}</Row>}
                {profile.rqNumber && <Row k={t("fiscalite.profile.rqNumber")}>{profile.rqNumber}</Row>}
                {profile.businessNumber && <Row k={t("fiscalite.profile.businessNumber")}>{profile.businessNumber}</Row>}
                {profile.startedAt && (
                  <Row k={t("fiscalite.profile.since")}>{formatDay(new Date(`${profile.startedAt.slice(0, 10)}T00:00:00Z`), { locale })}</Row>
                )}
                <Row k={t("fiscalite.profile.returns")}>
                  {profile.legalForm === "societe"
                    ? "CO-17 + T2"
                    : senc
                      ? t("fiscalite.profile.returns.senc")
                      : "TP-1 (TP-80) + T1 (T2125)"}
                </Row>
                {profile.legalForm === "societe" && (
                  <Row k={t("fiscalite.profile.yearEnd")}>{formatDay(fiscalYearRange(profile, year).end, { short: true, locale })}</Row>
                )}
                <Row k="TPS/TVQ">
                  {registered
                    ? t("fiscalite.profile.registered", {
                        frequency: FILING_FREQUENCY_KEYS[profile.filingFrequency as FilingFrequency]
                          ? t(FILING_FREQUENCY_KEYS[profile.filingFrequency as FilingFrequency]).toLowerCase()
                          : "",
                      })
                    : t("fiscalite.badge.smallSupplier")}
                </Row>
                {senc && (
                  <Row k={t("fiscalite.profile.partners")}>
                    {(profile.partners ?? [])
                      .map((p, i) =>
                        profile.partnerShares?.length === profile.partners?.length
                          ? `${p} ${profile.partnerShares[i]} %`
                          : p
                      )
                      .join(", ") || "—"}
                  </Row>
                )}
                {registered && <Row k={t("fiscalite.identity.qstNumber")}>{profile.qstNumber || "—"}</Row>}
                {registered && <Row k={t("fiscalite.identity.gstNumber")}>{profile.gstNumber || "—"}</Row>}
                {(profile.address || profile.city) && (
                  <Row k={t("fiscalite.profile.address")}>
                    {[profile.address, profile.city, profile.province, profile.postalCode].filter(Boolean).join(", ")}
                  </Row>
                )}
                {profile.email && <Row k={t("fiscalite.profile.email")}>{profile.email}</Row>}
                {profile.phone && <Row k={t("fiscalite.profile.phone")}>{profile.phone}</Row>}
                {profile.accountant && (
                  <Row k={t("fiscalite.profile.accountant")}>
                    {profile.accountantEmail ? (
                      <a href={`mailto:${profile.accountantEmail}`} className="underline underline-offset-2">
                        {profile.accountant}
                      </a>
                    ) : (
                      profile.accountant
                    )}
                  </Row>
                )}
              </dl>
              {missingIdentity.length > 0 && (
                <button
                  type="button"
                  onClick={() => setProfileOpen(true)}
                  className="mt-4 w-full rounded-xl bg-secondary px-3 py-2 text-left text-[12px] text-muted-foreground hover:bg-border/70"
                >
                  {t("fiscalite.profile.toComplete", { fields: missingIdentity.join(", ") })}
                </button>
              )}
            </section>
          )}

          <section className="tile p-6">
            <p className="etiquette flex items-center gap-1.5">
              <CalendarClock className="h-3.5 w-3.5" /> {t("fiscalite.deadlines.title")}
            </p>
            <ul className="mt-4 space-y-4">
              {deadlines.map((d, i) => (
                <li key={i} className="flex gap-3">
                  <span className="w-14 shrink-0 text-[13px] font-semibold tabular-nums">
                    {formatDay(d.date, { short: true, locale })}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[14px] font-medium leading-snug">
                      {d.titleKey ? t(d.titleKey, d.detailParams) : d.title}
                      {d.conditional && (
                        <span className="font-normal text-muted-foreground"> · {t("fiscalite.deadlines.ifApplicable")}</span>
                      )}
                    </span>
                    <span className="block text-[12px] text-muted-foreground">
                      {d.detailKey ? t(d.detailKey, d.detailParams) : d.detail}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {(senc || yearMovements.length > 0) && (
            <PartnersTile
              organisationId={org.id}
              partners={profile.partners ?? []}
              summaries={partnerRows}
              movements={yearMovements}
              onAdded={(m) => setMovements((prev) => [m, ...prev])}
              onDeleted={(id) => setMovements((prev) => prev.filter((m) => m.id !== id))}
            />
          )}

          {!registered && (
            <section className="tile p-6">
              <p className="etiquette">{t("fiscalite.supplier.title")}</p>
              <p className="mt-3 text-[24px] font-bold tabular-nums tracking-title">
                {formatMoney(supplier.total, { locale })}
                <span className="text-[14px] font-medium text-muted-foreground">
                  {" "}
                  / {formatMoney(SMALL_SUPPLIER_LIMIT_CENTS, { locale })}
                </span>
              </p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-secondary">
                <div
                  className={cn("h-full rounded-full", supplier.over ? "bg-negative" : supplier.ratio > 0.75 ? "bg-pending" : "bg-foreground")}
                  style={{ width: `${Math.min(100, supplier.ratio * 100)}%` }}
                />
              </div>
              <p className="mt-3 text-[13px] text-muted-foreground">
                {supplier.quarterOver
                  ? t("fiscalite.supplier.quarterOver")
                  : supplier.over
                    ? t("fiscalite.supplier.over")
                    : t("fiscalite.supplier.under")}
              </p>
            </section>
          )}

          <section className="tile p-6">
            <p className="etiquette">{t("fiscalite.tips.title")}</p>
            <ul className="mt-4 space-y-3 text-[13px] leading-relaxed">
              {tips(profile.legalForm, registered).map((key) => (
                <li key={key} className="flex gap-2">
                  <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/40" />
                  <span>{t(key)}</span>
                </li>
              ))}
            </ul>
            <p className="voice-note mt-5 text-[13px]">
              {t("fiscalite.tips.disclaimer")}
            </p>
          </section>
        </aside>
      </div>
      )}

      <InvoiceDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
        organisation={org}
        profile={profile}
        invoice={dialog.invoice}
        file={dialog.file}
        onSaved={(saved) =>
          setInvoices((prev) =>
            [saved, ...prev.filter((i) => i.id !== saved.id)].sort((a, b) => b.date.localeCompare(a.date))
          )
        }
        onDeleted={(id) => setInvoices((prev) => prev.filter((i) => i.id !== id))}
      />
      <ImportDialog organisation={org} file={importFile} onClose={() => setImportFile(null)} />
      <TaxProfileDialog
        open={profileOpen}
        onOpenChange={setProfileOpen}
        organisation={org}
        profile={savedProfile}
        defaultLegalForm={org.kind === "perso" ? "personnel" : undefined}
        onSaved={(p) => setProfiles((prev) => [...prev.filter((x) => x.organisationId !== p.organisationId), p])}
      />
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

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="truncate text-right font-medium">{children}</dd>
    </div>
  );
}

function tips(legalForm: string, registered: boolean): string[] {
  const out: string[] = [];
  if (legalForm === "senc") {
    out.push(
      "fiscalite.tips.senc.partnersTaxed",
      "fiscalite.tips.senc.drawings",
      "fiscalite.tips.senc.paidByMe",
      "fiscalite.tips.senc.agreement"
    );
  } else if (legalForm === "societe") {
    out.push(
      "fiscalite.tips.societe.ownTax",
      "fiscalite.tips.societe.salaryDividends",
      "fiscalite.tips.societe.noPersonal"
    );
  } else {
    out.push(
      "fiscalite.tips.individuelle.setAside",
      "fiscalite.tips.individuelle.bankAccount",
      "fiscalite.tips.individuelle.homeOffice"
    );
  }
  if (registered) {
    out.push(
      "fiscalite.tips.registered.notYourMoney",
      "fiscalite.tips.registered.supplierNumber"
    );
  } else {
    out.push(
      "fiscalite.tips.smallSupplier.voluntary"
    );
  }
  out.push("fiscalite.tips.keepReceipts");
  return out;
}

/** One row per organisation, with a switch: flagged ones get a tab here. */
function OrgPicker({
  organisations,
  isTracked,
  invoiceCount,
  onChange,
}: {
  organisations: Org[];
  isTracked: (id: string) => boolean;
  invoiceCount: (id: string) => number;
  onChange: (id: string, tracked: boolean) => void;
}) {
  const t = useT();
  return (
    <ul className="space-y-1">
      {organisations.map((o) => {
        const n = invoiceCount(o.id);
        return (
          <li key={o.id}>
            <label className="flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2 hover:bg-secondary">
              <Avatar
                image={o.image}
                fallback={o.name.charAt(0).toUpperCase()}
                color={o.color ?? DEFAULT_PROJECT_COLOR}
                shape="rounded"
                className="h-7 w-7 rounded-lg text-[12px]"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-medium">{o.name}</span>
                {n > 0 && (
                  <span className="block text-[12px] text-muted-foreground">
                    {t("fiscalite.board.invoiceCount", { count: n })}
                  </span>
                )}
              </span>
              <Switch checked={isTracked(o.id)} onCheckedChange={(v) => onChange(o.id, v)} />
            </label>
          </li>
        );
      })}
    </ul>
  );
}
