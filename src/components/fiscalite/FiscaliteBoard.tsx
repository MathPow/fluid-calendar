"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { Avatar } from "@/components/projets/ImageField";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { cn } from "@/lib/utils";

import {
  DEFAULT_PROFILE,
  FILING_FREQUENCIES,
  LEGAL_FORMS,
  SMALL_SUPPLIER_LIMIT_CENTS,
  categoryLabel,
  deadlinesFor,
  fiscalYearOf,
  fiscalYearRange,
  formatDay,
  formatMoney,
  invoiceIssues,
  smallSupplierTest,
  summarize,
} from "@/lib/fiscalite/meta";
import type { InvoiceView } from "@/lib/fiscalite/queries";
import { INVOICE_MIMES, MAX_INVOICE_BYTES } from "@/lib/fiscalite/schemas";
import { DEFAULT_PROJECT_COLOR } from "@/lib/projets/meta";

import { InvoiceDialog } from "./InvoiceDialog";
import { type ProfileView, TaxProfileDialog } from "./TaxProfileDialog";

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
}

const ORG_KEY = "fiscalite.org";

/**
 * The Fiscalité tab: pick a company, drop its invoices, and read the guide
 * (deadlines, TPS/TVQ to remit, small-supplier threshold, what to fix).
 */
export function FiscaliteBoard({ organisations, profiles: initialProfiles, invoices: initial }: FiscaliteBoardProps) {
  const [orgId, setOrgId] = useState<string | null>(organisations[0]?.id ?? null);
  const [invoices, setInvoices] = useState(initial);
  const [profiles, setProfiles] = useState(initialProfiles);
  const [filter, setFilter] = useState<"all" | "depense" | "revenu">("all");
  const [dragging, setDragging] = useState(false);
  const [dialog, setDialog] = useState<{ open: boolean; invoice?: InvoiceView | null; file?: File | null }>({
    open: false,
  });
  const [profileOpen, setProfileOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(ORG_KEY);
      if (saved && organisations.some((o) => o.id === saved)) setOrgId(saved);
    } catch {}
  }, [organisations]);
  const pickOrg = (id: string) => {
    setOrgId(id);
    try {
      localStorage.setItem(ORG_KEY, id);
    } catch {}
  };

  const org = organisations.find((o) => o.id === orgId) ?? null;
  const savedProfile = profiles.find((p) => p.organisationId === orgId) ?? null;
  const profile = useMemo(
    () => savedProfile ?? { ...DEFAULT_PROFILE, organisationId: orgId ?? "", notes: null },
    [savedProfile, orgId]
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

  const openFile = (file: File | undefined | null) => {
    if (!file || !org) return;
    if (!INVOICE_MIMES.includes(file.type)) {
      toast.error("PDF ou image seulement.");
      return;
    }
    if (file.size > MAX_INVOICE_BYTES) {
      toast.error("Fichier trop lourd (15 Mo max).");
      return;
    }
    setDialog({ open: true, file, invoice: null });
  };

  if (!org) {
    return (
      <div className="page pb-16 pt-8 md:pt-12">
        <h1 className="display text-[44px] sm:text-[64px] md:text-[80px]">Fiscalité.</h1>
        <p className="mt-6 text-muted-foreground">
          Crée d&apos;abord une organisation de type « À moi » dans Projets pour y classer des factures.
        </p>
      </div>
    );
  }

  const netGst = summary.gstCollected - summary.itc;
  const netQst = summary.qstCollected - summary.itr;

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
        openFile(e.dataTransfer.files?.[0]);
      }}
    >
      <header className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="display text-[44px] sm:text-[64px] md:text-[80px]">Fiscalité.</h1>
          <div className="mt-6 flex flex-wrap gap-2">
            <Badge className="px-4 py-2 text-[13px]">
              {LEGAL_FORMS.find((f) => f.id === profile.legalForm)?.label}
            </Badge>
            <Badge variant={registered ? "positive" : "default"} className="px-4 py-2 text-[13px]">
              {registered ? "Inscrit TPS/TVQ" : "Petit fournisseur"}
            </Badge>
            {warnCount > 0 && (
              <Badge variant="pending" className="px-4 py-2 text-[13px]">
                {warnCount} facture{warnCount > 1 ? "s" : ""} à corriger
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
          <div className="segmented h-11">
            <button type="button" className="segmented-item h-9 px-2" onClick={() => setYear(year - 1)} aria-label="Année précédente">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="px-2 text-[14px] font-semibold tabular-nums">
              {profile.legalForm === "societe" && profile.fiscalYearEnd !== "12-31" ? `Exercice ${year}` : year}
            </span>
            <button type="button" className="segmented-item h-9 px-2" onClick={() => setYear(year + 1)} aria-label="Année suivante">
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
            Dépose une facture de {org.name}
          </p>
          <p className="mt-1 text-[13px] text-muted-foreground">
            PDF ou photo · émise ou reçue · les montants et les taxes sont lus automatiquement
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
            <FilePlus2 /> Saisie sans fichier
          </Button>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept={INVOICE_MIMES.join(",")}
          className="hidden"
          onChange={(e) => {
            openFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-6">
          {/* Year at a glance */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Revenus (avant taxes)" value={formatMoney(summary.revenueCents)} />
            <Stat
              label="Dépenses déductibles"
              value={formatMoney(summary.deductibleCents)}
              hint={summary.capitalCents ? `+ ${formatMoney(summary.capitalCents)} d'équipement (DPA)` : undefined}
            />
            <Stat
              label="Bénéfice estimé"
              value={formatMoney(summary.profitCents)}
              tone={summary.profitCents < 0 ? "neg" : undefined}
            />
            {registered ? (
              <Stat
                label="TPS + TVQ à remettre"
                value={formatMoney(netGst + netQst)}
                hint={`TPS ${formatMoney(netGst)} · TVQ ${formatMoney(netQst)}`}
                tone={netGst + netQst < 0 ? "pos" : undefined}
              />
            ) : (
              <Stat
                label="Taxes payées (non récupérables)"
                value={formatMoney(summary.gstPaid + summary.qstPaid)}
                hint="Incluses dans tes dépenses"
              />
            )}
          </div>
          <p className="text-[12px] text-muted-foreground">
            {formatDay(range.start)} → {formatDay(range.end)} · {yearInvoices.length} facture
            {yearInvoices.length > 1 ? "s" : ""}
          </p>

          {/* Invoice list */}
          <section className="tile p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-[20px] font-bold tracking-title">Factures</h2>
              <div className="segmented">
                {(
                  [
                    ["all", "Toutes"],
                    ["depense", "Dépenses"],
                    ["revenu", "Revenus"],
                  ] as const
                ).map(([id, label]) => (
                  <button key={id} type="button" className="segmented-item" data-active={filter === id} onClick={() => setFilter(id)}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {visible.length === 0 ? (
              <p className="mt-6 text-[14px] text-muted-foreground">
                Aucune facture pour cette période. Dépose la première ci-dessus.
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
                            {inv.party || inv.description || "Sans nom"}
                            {inv.file && <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                          </span>
                          <span className="block truncate text-[12px] text-muted-foreground">
                            {formatDay(new Date(inv.date), { short: true })} · {categoryLabel(inv.direction, inv.category)}
                            {inv.number ? ` · no ${inv.number}` : ""}
                          </span>
                          {warn.length > 0 && (
                            <span className="mt-1 flex items-center gap-1 text-[12px] text-pending-foreground">
                              <AlertTriangle className="h-3 w-3 shrink-0" />
                              <span className="truncate">{warn[0].text}</span>
                            </span>
                          )}
                        </span>
                        <span className="text-right">
                          <span className={cn("block text-[15px] font-semibold tabular-nums", income && "text-positive-foreground")}>
                            {income ? "+" : "−"}
                            {formatMoney(inv.totalCents)}
                          </span>
                          {inv.gstCents + inv.qstCents > 0 && (
                            <span className="block text-[11px] tabular-nums text-muted-foreground">
                              taxes {formatMoney(inv.gstCents + inv.qstCents)}
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
              <h2 className="text-[20px] font-bold tracking-title">Dépenses par ligne</h2>
              <p className="mt-1 text-[13px] text-muted-foreground">
                {profile.legalForm === "societe"
                  ? "Regroupées comme dans l'état des résultats de ta T2 / CO-17."
                  : "Ce que tu reportes dans la T2125 (fédéral) et le TP-80 (Québec)."}
              </p>
              <ul className="mt-4 space-y-2">
                {summary.byCategory.map((c) => (
                  <li key={c.id} className="flex items-baseline gap-3 text-[14px]">
                    <span className="w-12 shrink-0 text-[12px] tabular-nums text-muted-foreground">{c.line ?? ""}</span>
                    <span className="min-w-0 flex-1 truncate">{c.label}</span>
                    {c.deductibleCents !== c.cents && (
                      <span className="text-[12px] tabular-nums text-muted-foreground">
                        {formatMoney(c.cents)} →
                      </span>
                    )}
                    <span className="font-medium tabular-nums">{formatMoney(c.deductibleCents || c.cents)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        {/* Guide */}
        <aside className={cn("space-y-6", !savedProfile && "order-first lg:order-none")}>
          {!savedProfile ? (
            <section className="tile-ink p-6">
              <p className="etiquette text-background/60">Étape 1</p>
              <h2 className="mt-3 text-[22px] font-bold leading-tight tracking-title">
                Dis-moi comment {org.name} est constituée.
              </h2>
              <p className="mt-2 text-[14px] text-background/70">
                Entreprise individuelle ou société, inscrite aux taxes ou non: tout le reste en découle
                (formulaires, échéances, taxes à remettre).
              </p>
              <Button variant="secondary" className="mt-5" onClick={() => setProfileOpen(true)}>
                Remplir le profil fiscal
              </Button>
            </section>
          ) : (
            <section className="tile p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="etiquette">Profil fiscal</p>
                  <h2 className="mt-2 text-[18px] font-bold tracking-title">
                    {LEGAL_FORMS.find((f) => f.id === profile.legalForm)?.label}
                  </h2>
                </div>
                <Button size="sm" variant="secondary" onClick={() => setProfileOpen(true)}>
                  <Pencil /> Modifier
                </Button>
              </div>
              <dl className="mt-4 space-y-1.5 text-[13px]">
                <Row k="Déclarations">
                  {profile.legalForm === "societe" ? "T2 + CO-17" : "T1 (T2125) + TP-1 (TP-80)"}
                </Row>
                {profile.legalForm === "societe" && (
                  <Row k="Fin d'exercice">{formatDay(fiscalYearRange(profile, year).end, { short: true })}</Row>
                )}
                <Row k="TPS/TVQ">
                  {registered
                    ? `Inscrit · ${FILING_FREQUENCIES.find((f) => f.id === profile.filingFrequency)?.label.toLowerCase()}`
                    : "Petit fournisseur"}
                </Row>
                {registered && <Row k="No TPS">{profile.gstNumber || "—"}</Row>}
                {registered && <Row k="No TVQ">{profile.qstNumber || "—"}</Row>}
              </dl>
            </section>
          )}

          <section className="tile p-6">
            <p className="etiquette flex items-center gap-1.5">
              <CalendarClock className="h-3.5 w-3.5" /> Prochaines échéances
            </p>
            <ul className="mt-4 space-y-4">
              {deadlines.map((d, i) => (
                <li key={i} className="flex gap-3">
                  <span className="w-14 shrink-0 text-[13px] font-semibold tabular-nums">
                    {formatDay(d.date, { short: true })}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[14px] font-medium leading-snug">
                      {d.title}
                      {d.conditional && <span className="font-normal text-muted-foreground"> · si applicable</span>}
                    </span>
                    <span className="block text-[12px] text-muted-foreground">{d.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {!registered && (
            <section className="tile p-6">
              <p className="etiquette">Seuil du petit fournisseur</p>
              <p className="mt-3 text-[24px] font-bold tabular-nums tracking-title">
                {formatMoney(supplier.total)}
                <span className="text-[14px] font-medium text-muted-foreground">
                  {" "}
                  / {formatMoney(SMALL_SUPPLIER_LIMIT_CENTS)}
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
                  ? "Plus de 30 000 $ dans un seul trimestre: tu dois t'inscrire et facturer les taxes dès la vente qui fait dépasser."
                  : supplier.over
                    ? "Dépassé sur quatre trimestres: inscris-toi aux TPS/TVQ (Revenu Québec gère les deux) au plus tard dans le mois suivant."
                    : "Ventes des quatre derniers trimestres (celui en cours inclus). Au-delà de 30 000 $, l'inscription TPS/TVQ devient obligatoire."}
              </p>
            </section>
          )}

          <section className="tile p-6">
            <p className="etiquette">À savoir</p>
            <ul className="mt-4 space-y-3 text-[13px] leading-relaxed">
              {tips(profile.legalForm, registered).map((t) => (
                <li key={t} className="flex gap-2">
                  <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/40" />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
            <p className="voice-note mt-5 text-[13px]">
              Règles générales, pas un avis professionnel: pour ta déclaration finale, fais valider par un
              comptable.
            </p>
          </section>
        </aside>
      </div>

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
      <TaxProfileDialog
        open={profileOpen}
        onOpenChange={setProfileOpen}
        organisation={org}
        profile={savedProfile}
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
  if (legalForm === "societe") {
    out.push(
      "La société paie son propre impôt (autour de 12 % au Québec avec la déduction pour petite entreprise, si elle y a droit). Toi, tu es imposé sur ce que tu te verses.",
      "Salaire ou dividendes: le salaire crée des cotisations RRQ et des T4/RL-1 à produire; le dividende est plus simple mais ne cotise pas. C'est LA question à poser à ton comptable.",
      "Ne paie pas tes dépenses perso avec le compte de la société: ça devient un avantage imposable."
    );
  } else {
    out.push(
      "Ton bénéfice s'ajoute à tes autres revenus, et tu paies les deux parts de RRQ (≈ 12,8 %) plus le RQAP. Mets de côté 25 à 30 % de ton bénéfice.",
      "Un compte bancaire séparé pour l'entreprise rend tout ça beaucoup plus simple.",
      "Bureau à domicile: déductible au prorata de la superficie, mais seulement jusqu'à ramener le bénéfice à zéro."
    );
  }
  if (registered) {
    out.push(
      "TPS/TVQ perçues ≠ ton argent: réserve-les dès l'encaissement. Tu remets la différence avec celles payées sur tes achats (CTI/RTI).",
      "Pour réclamer les taxes d'un achat de 100 $ et plus, la facture doit montrer le no TPS/TVQ du fournisseur."
    );
  } else {
    out.push(
      "Petit fournisseur: tu ne factures pas de taxes, et celles que tu paies font partie de tes dépenses. T'inscrire volontairement peut valoir le coup si tu achètes beaucoup d'équipement."
    );
  }
  out.push("Garde chaque facture et reçu 6 ans: c'est exactement ce que ce dossier fait.");
  return out;
}
