"use client";

import { useEffect, useMemo, useState } from "react";

import {
  ArrowDownLeft,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Paperclip,
  Pencil,
  Plus,
  Settings2,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

import {
  type Budgets,
  PERSONAL_EXPENSE_CATEGORIES,
  categoryLabel,
  centsToInput,
  formatDay,
  formatMoney,
  monthSummary,
  parseMoney,
  personalCategory,
} from "@/lib/fiscalite/meta";
import type { InvoiceView } from "@/lib/fiscalite/queries";
import { cn } from "@/lib/utils";

import { ExcelActions } from "./ExcelActions";

interface PersonalBudgetProps {
  organisation: { id: string; name: string };
  invoices: InvoiceView[];
  budgets: Budgets;
  onOpenInvoice: (invoice: InvoiceView) => void;
  onAdd: () => void;
  onEditProfile: () => void;
  onBudgetsSaved: (budgets: Budgets) => void;
}

type Scope = "month" | "year" | "all";

const thisMonth = () => new Date().toLocaleDateString("en-CA").slice(0, 7);
const thisYear = () => new Date().getFullYear();

function shiftMonth(month: string, n: number) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
}

function monthLabel(month: string, opts?: { long?: boolean }) {
  const [y, m] = month.split("-").map(Number);
  const s = new Intl.DateTimeFormat("fr-CA", {
    month: opts?.long ? "long" : "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, 1)));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const monthShort = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-CA", {
    month: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, 1)));
};

/** Sums across a set of months. */
function periodTotals(invoices: InvoiceView[], months: string[]) {
  let income = 0;
  let expense = 0;
  const perCategory = new Map<string, number>();
  const set = new Set(months);
  for (const inv of invoices) {
    if (!set.has(inv.date.slice(0, 7))) continue;
    const amount = inv.totalCents || inv.subtotalCents;
    if (inv.direction === "revenu") {
      income += amount;
    } else {
      expense += amount;
      const key = inv.category || "p-autres";
      perCategory.set(key, (perCategory.get(key) ?? 0) + amount);
    }
  }
  return { income, expense, perCategory };
}

/**
 * Budget perso: at a glance for a month, a year or the whole history. A bar
 * chart of income vs expenses, running savings, and a category ranking with
 * per-month sparklines — so trends read as fast as totals.
 */
export function PersonalBudget({
  organisation,
  invoices,
  budgets,
  onOpenInvoice,
  onAdd,
  onEditProfile,
  onBudgetsSaved,
}: PersonalBudgetProps) {
  const [scope, setScope] = useState<Scope>("month");
  const [month, setMonth] = useState(thisMonth);
  const [year, setYear] = useState<number>(thisYear());
  const [editing, setEditing] = useState(false);

  // Every month with a row, oldest → newest. Used by year and all-time views.
  const activeMonths = useMemo(() => {
    const seen = new Set<string>();
    for (const i of invoices) seen.add(i.date.slice(0, 7));
    return [...seen].sort();
  }, [invoices]);
  const years = useMemo(
    () => [...new Set(activeMonths.map((m) => Number(m.slice(0, 4))))].sort(),
    [activeMonths]
  );

  // The set of months the current scope covers, and the previous set to
  // compare it to (last month / last year / n/a for « Tout »).
  const { months, prevMonths, headerLabel } = useMemo(() => {
    if (scope === "month") {
      return {
        months: [month],
        prevMonths: [shiftMonth(month, -1)],
        headerLabel: monthLabel(month, { long: true }),
      };
    }
    if (scope === "year") {
      const ms = Array.from(
        { length: 12 },
        (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`
      );
      const prev = Array.from(
        { length: 12 },
        (_, i) => `${year - 1}-${String(i + 1).padStart(2, "0")}`
      );
      return { months: ms, prevMonths: prev, headerLabel: String(year) };
    }
    return {
      months: activeMonths,
      prevMonths: [],
      headerLabel: "Tout l'historique",
    };
  }, [scope, month, year, activeMonths]);

  const monthS = useMemo(
    () => monthSummary(invoices, budgets, month),
    [invoices, budgets, month]
  );
  const totals = useMemo(
    () => periodTotals(invoices, months),
    [invoices, months]
  );
  const prevTotals = useMemo(
    () => (prevMonths.length ? periodTotals(invoices, prevMonths) : null),
    [invoices, prevMonths]
  );
  const averages = useAverages(invoices, month);

  // Bar chart: one bar per month, income (positive) vs expenses (negative).
  const bars = useMemo(
    () =>
      months.map((m) => {
        const t = periodTotals(invoices, [m]);
        return { month: m, income: t.income, expense: t.expense };
      }),
    [invoices, months]
  );

  // Sparkline for a category: expense in each month of the current scope.
  const sparklinesFor = (id: string) =>
    months.map((m) =>
      invoices
        .filter(
          (i) =>
            i.direction === "depense" &&
            (i.category || "p-autres") === id &&
            i.date.slice(0, 7) === m
        )
        .reduce((a, b) => a + (b.totalCents || b.subtotalCents), 0)
    );

  // Ranked category list for the current scope.
  const categories = useMemo(() => {
    const rows = [...totals.perCategory.entries()].map(([id, cents]) => {
      const cat = personalCategory(id);
      return {
        id,
        label: cat?.label ?? categoryLabel("depense", id),
        color: cat?.color ?? "#cfcac2",
        spentCents: cents,
        monthlyBudgetCents: budgets[id] ?? 0,
      };
    });
    return rows.sort((a, b) => b.spentCents - a.spentCents);
  }, [totals, budgets]);

  const nMonths = months.length || 1;
  const budgetForPeriod =
    Object.values(budgets).reduce((a, b) => a + (b || 0), 0) * nMonths;
  const net = totals.income - totals.expense;
  const prevNet = prevTotals ? prevTotals.income - prevTotals.expense : null;

  // Running savings, one point per month in the scope.
  const cumulative = useMemo(() => {
    const set = new Set(months);
    const contrib = new Map<string, number>();
    for (const i of invoices) {
      const m = i.date.slice(0, 7);
      if (!set.has(m)) continue;
      const amount = i.totalCents || i.subtotalCents;
      const delta = i.direction === "revenu" ? amount : -amount;
      contrib.set(m, (contrib.get(m) ?? 0) + delta);
    }
    let running = 0;
    return months.map((m) => (running += contrib.get(m) ?? 0));
  }, [invoices, months]);

  // Best and worst month by savings, over the current scope.
  const bestWorst = useMemo(() => {
    if (bars.length < 2) return null;
    const savings = bars.map((b) => ({
      month: b.month,
      value: b.income - b.expense,
    }));
    const best = savings.reduce((a, b) => (b.value > a.value ? b : a));
    const worst = savings.reduce((a, b) => (b.value < a.value ? b : a));
    return best.month === worst.month ? null : { best, worst };
  }, [bars]);

  const monthBudgetLeft =
    monthS.budgetCents -
    monthS.lines.reduce((a, l) => a + (l.budgetCents ? l.spentCents : 0), 0);

  const noData = totals.income === 0 && totals.expense === 0;

  return (
    <div className="mt-8 space-y-6">
      {/* Header: period type + range navigator + actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="segmented h-11">
            <button
              type="button"
              className="segmented-item h-9"
              data-active={scope === "month"}
              onClick={() => setScope("month")}
            >
              Mois
            </button>
            <button
              type="button"
              className="segmented-item h-9"
              data-active={scope === "year"}
              onClick={() => setScope("year")}
            >
              Année
            </button>
            <button
              type="button"
              className="segmented-item h-9"
              data-active={scope === "all"}
              onClick={() => setScope("all")}
            >
              Tout
            </button>
          </div>
          {scope !== "all" && (
            <div className="segmented h-11">
              <button
                type="button"
                className="segmented-item h-9 px-2"
                onClick={() =>
                  scope === "month"
                    ? setMonth(shiftMonth(month, -1))
                    : setYear(year - 1)
                }
                aria-label="Précédent"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="min-w-[150px] px-2 text-center text-[14px] font-semibold capitalize">
                {headerLabel}
              </span>
              <button
                type="button"
                className="segmented-item h-9 px-2"
                onClick={() =>
                  scope === "month"
                    ? setMonth(shiftMonth(month, 1))
                    : setYear(year + 1)
                }
                aria-label="Suivant"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
          {scope === "year" && years.length > 1 && (
            <div className="flex gap-1">
              {years.map((y) => (
                <button
                  key={y}
                  type="button"
                  onClick={() => setYear(y)}
                  aria-pressed={year === y}
                  className={cn(
                    "rounded-full px-2.5 py-1 text-[12px] font-medium transition-colors",
                    year === y
                      ? "bg-foreground text-background"
                      : "bg-secondary text-muted-foreground hover:text-foreground"
                  )}
                >
                  {y}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={onAdd}>
            <Plus /> Ajouter
          </Button>
          <ExcelActions
            organisation={organisation}
            year={scope === "month" ? Number(month.slice(0, 4)) : year}
          />
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setEditing(true)}
          >
            <Pencil /> Budget
          </Button>
          <Button size="sm" variant="ghost" onClick={onEditProfile}>
            <Settings2 /> Profil
          </Button>
        </div>
      </div>

      {/* Stat tiles: totals for the scope, with a delta vs the previous one */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          label={
            scope === "month" ? "Revenus du mois" : `Revenus (${headerLabel})`
          }
          value={formatMoney(totals.income)}
          delta={prevTotals ? totals.income - prevTotals.income : null}
        />
        <Stat
          label={
            scope === "month" ? "Dépenses du mois" : `Dépenses (${headerLabel})`
          }
          value={formatMoney(totals.expense)}
          delta={prevTotals ? totals.expense - prevTotals.expense : null}
          /* A smaller number is the good one for expenses. */
          deltaFlip
        />
        <Stat
          label={scope === "month" ? "Reste" : "Épargne"}
          value={formatMoney(net)}
          tone={net < 0 ? "neg" : "pos"}
          delta={prevNet !== null ? net - prevNet : null}
        />
        {scope === "month" ? (
          <Stat
            label="Budget restant"
            value={monthS.budgetCents ? formatMoney(monthBudgetLeft) : "—"}
            hint={
              monthS.budgetCents
                ? `sur ${formatMoney(monthS.budgetCents)}`
                : "Fixe un budget par catégorie"
            }
            tone={monthS.budgetCents && monthBudgetLeft < 0 ? "neg" : undefined}
          />
        ) : (
          <Stat
            label="Épargne / mois"
            value={formatMoney(Math.round(net / nMonths))}
            hint={
              budgetForPeriod
                ? `Budget prévu ${formatMoney(budgetForPeriod)}`
                : `${nMonths} mois`
            }
            tone={net < 0 ? "neg" : "pos"}
          />
        )}
      </div>

      {noData ? (
        <div className="tile flex flex-col items-center gap-2 p-10 text-center">
          <p className="text-[15px] font-semibold tracking-title">
            Rien pour {headerLabel.toLowerCase()}.
          </p>
          <p className="max-w-md text-[13px] text-muted-foreground">
            Dépose un reçu, importe ton Budget.xlsx ou le CSV de ton compte Wealthsimple, ou change de période.
          </p>
        </div>
      ) : (
        <>
          {/* Big chart: monthly bars + running savings, hidden in month view */}
          {scope !== "month" && (
            <section className="tile p-5 sm:p-6">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h2 className="text-[20px] font-bold tracking-title">
                  Revenus, dépenses et épargne
                </h2>
                <ChartLegend />
              </div>
              <MonthlyChart bars={bars} cumulative={cumulative} />
              {bestWorst && (
                <div className="mt-4 flex flex-wrap gap-4 text-[13px]">
                  <span className="inline-flex items-center gap-1.5 text-positive-foreground">
                    <TrendingUp className="h-3.5 w-3.5" />
                    <span className="text-muted-foreground">Meilleur mois</span>
                    <span className="font-semibold capitalize">
                      {monthShort(bestWorst.best.month)}
                    </span>
                    <span className="tabular-nums">
                      +{formatMoney(bestWorst.best.value)}
                    </span>
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-negative-foreground">
                    <TrendingDown className="h-3.5 w-3.5" />
                    <span className="text-muted-foreground">Pire mois</span>
                    <span className="font-semibold capitalize">
                      {monthShort(bestWorst.worst.month)}
                    </span>
                    <span className="tabular-nums">
                      {formatMoney(bestWorst.worst.value)}
                    </span>
                  </span>
                </div>
              )}
            </section>
          )}

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
            <section className="tile p-5 sm:p-6">
              <h2 className="text-[20px] font-bold tracking-title">
                Par catégorie
                {scope !== "month" && (
                  <span className="ml-2 text-[13px] font-normal text-muted-foreground">
                    · classées par montant
                  </span>
                )}
              </h2>
              {scope === "month" ? (
                <MonthCategoryList
                  lines={monthS.lines}
                  totalCents={monthS.expenseCents}
                />
              ) : (
                <CategoryRanking
                  rows={categories}
                  monthsCount={nMonths}
                  spark={sparklinesFor}
                  totalExpenseCents={totals.expense}
                />
              )}
            </section>

            <section className="tile p-5 sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-[20px] font-bold tracking-title">
                  {scope === "month" ? "Transactions" : "Répartition"}
                </h2>
                {scope === "month" && (
                  <Button
                    size="icon"
                    variant="secondary"
                    className="h-8 w-8"
                    onClick={onAdd}
                    aria-label="Ajouter une transaction"
                  >
                    <Plus />
                  </Button>
                )}
              </div>
              {scope === "month" ? (
                <TransactionsList
                  invoices={monthS.invoices}
                  onOpenInvoice={onOpenInvoice}
                  monthLabel={monthLabel(month).toLowerCase()}
                />
              ) : (
                <CategoryDonut rows={categories} totalCents={totals.expense} />
              )}
            </section>
          </div>

          {scope !== "month" && (
            <PeriodTransactions
              invoices={invoices}
              months={months}
              onOpenInvoice={onOpenInvoice}
            />
          )}
        </>
      )}

      <BudgetDialog
        open={editing}
        onOpenChange={setEditing}
        organisationId={organisation.id}
        budgets={budgets}
        averages={averages}
        onSaved={onBudgetsSaved}
      />
    </div>
  );
}

/* ---------------------------------------------------------- month category list */

function MonthCategoryList({
  lines,
  totalCents,
}: {
  lines: {
    id: string;
    label: string;
    color: string;
    spentCents: number;
    budgetCents: number;
  }[];
  totalCents: number;
}) {
  if (lines.length === 0)
    return (
      <p className="mt-4 text-[14px] text-muted-foreground">
        Rien ce mois-ci. Dépose un reçu ou fixe ton budget pour commencer.
      </p>
    );
  return (
    <ul className="mt-5 space-y-4">
      {lines.map((l) => {
        const over = l.budgetCents > 0 && l.spentCents > l.budgetCents;
        const ratio = l.budgetCents
          ? Math.min(1, l.spentCents / l.budgetCents)
          : l.spentCents && totalCents
            ? l.spentCents / totalCents
            : 0;
        return (
          <li key={l.id}>
            <div className="flex items-baseline justify-between gap-3 text-[14px]">
              <span className="flex min-w-0 items-center gap-2 font-medium">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: l.color }}
                />
                <span className="truncate">{l.label}</span>
              </span>
              <span
                className={cn(
                  "shrink-0 tabular-nums",
                  over && "font-semibold text-negative-foreground"
                )}
              >
                {formatMoney(l.spentCents)}
                {l.budgetCents > 0 && (
                  <span className="font-normal text-muted-foreground">
                    {" / "}
                    {formatMoney(l.budgetCents)}
                  </span>
                )}
              </span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-secondary">
              <div
                className={cn(
                  "h-full rounded-full",
                  over ? "bg-negative" : !l.budgetCents && "opacity-40"
                )}
                style={{
                  width: `${ratio * 100}%`,
                  backgroundColor: over ? undefined : l.color,
                }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/* --------------------------------------------------------- category ranking (period) */

function CategoryRanking({
  rows,
  monthsCount,
  spark,
  totalExpenseCents,
}: {
  rows: {
    id: string;
    label: string;
    color: string;
    spentCents: number;
    monthlyBudgetCents: number;
  }[];
  monthsCount: number;
  spark: (id: string) => number[];
  totalExpenseCents: number;
}) {
  if (rows.length === 0)
    return (
      <p className="mt-4 text-[14px] text-muted-foreground">
        Aucune dépense pour cette période.
      </p>
    );
  return (
    <ul className="mt-4 divide-y divide-border">
      {rows.map((r) => {
        const monthly = Math.round(r.spentCents / monthsCount);
        const share = totalExpenseCents
          ? Math.round((r.spentCents / totalExpenseCents) * 100)
          : 0;
        const values = spark(r.id);
        const budgetOverrun =
          r.monthlyBudgetCents > 0 && monthly > r.monthlyBudgetCents;
        return (
          <li
            key={r.id}
            className="grid grid-cols-[1fr_auto] items-center gap-3 py-3"
          >
            <div className="min-w-0">
              <div className="flex items-baseline gap-2">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: r.color }}
                />
                <span className="truncate text-[14px] font-medium">
                  {r.label}
                </span>
                <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                  {share}%
                </span>
              </div>
              <div className="mt-1.5">
                <Sparkline values={values} color={r.color} />
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                {formatMoney(monthly)}/mois
                {r.monthlyBudgetCents > 0 && (
                  <span
                    className={cn(budgetOverrun && "text-negative-foreground")}
                  >
                    {" · budget "}
                    {formatMoney(r.monthlyBudgetCents)}
                  </span>
                )}
              </div>
            </div>
            <span
              className={cn(
                "shrink-0 text-right text-[15px] font-semibold tabular-nums",
                budgetOverrun && "text-negative-foreground"
              )}
            >
              {formatMoney(r.spentCents)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/* ------------------------------------------------------------- chart primitives */

function ChartLegend() {
  return (
    <div className="flex flex-wrap items-center gap-3 text-[12px]">
      <span className="inline-flex items-center gap-1.5">
        <span
          className="h-2 w-2.5 rounded-sm"
          style={{ backgroundColor: "hsl(var(--tint-400))" }}
        />
        Revenus
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span
          className="h-2 w-2.5 rounded-sm"
          style={{ backgroundColor: "hsl(var(--pending-foreground))" }}
        />
        Dépenses
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span
          className="h-[2px] w-3.5"
          style={{ backgroundColor: "hsl(var(--foreground))" }}
        />
        Épargne cumulée
      </span>
    </div>
  );
}

/** Round a max value up to a nicely-labelled scale. */
function niceMax(v: number) {
  if (v <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  const norm = v / mag;
  const nice = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return nice * mag;
}

/**
 * Income / expense bars per month with a running savings line above. Pure
 * SVG so it works in prod without a chart library.
 */
function MonthlyChart({
  bars,
  cumulative,
}: {
  bars: { month: string; income: number; expense: number }[];
  cumulative: number[];
}) {
  const W = 900;
  const H = 240;
  const padL = 44;
  const padR = 12;
  const padT = 16;
  const padB = 30;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;
  const [hover, setHover] = useState<number | null>(null);

  const rawMax = Math.max(1, ...bars.map((b) => Math.max(b.income, b.expense)));
  const maxBar = niceMax(rawMax);
  const cumMax = Math.max(1, ...cumulative.map((v) => Math.abs(v)));

  const step = chartW / Math.max(1, bars.length);
  const barW = Math.min(24, Math.max(4, (step - 6) / 2));

  const y = (v: number) => padT + chartH - (v / maxBar) * chartH;
  const cy = (v: number) => padT + chartH / 2 - (v / cumMax) * (chartH / 2);

  const linePath = cumulative
    .map(
      (v, i) => `${i === 0 ? "M" : "L"}${padL + step * i + step / 2},${cy(v)}`
    )
    .join(" ");

  const ticks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div className="mt-5 overflow-x-auto">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        width="100%"
        className="block h-[240px] min-w-[560px]"
        onMouseLeave={() => setHover(null)}
      >
        {/* grid + y-axis labels */}
        {ticks.map((r, i) => {
          const yy = padT + chartH * (1 - r);
          return (
            <g key={i}>
              <line
                x1={padL}
                y1={yy}
                x2={W - padR}
                y2={yy}
                stroke="hsl(var(--border))"
                strokeDasharray={r === 0 ? undefined : "2 3"}
              />
              <text
                x={padL - 6}
                y={yy + 3}
                textAnchor="end"
                className="fill-muted-foreground text-[10px] tabular-nums"
              >
                {formatMoney(Math.round(maxBar * r))}
              </text>
            </g>
          );
        })}

        {/* bars */}
        {bars.map((b, i) => {
          const x = padL + step * i + step / 2;
          const active = hover === i;
          return (
            <g
              key={b.month}
              onMouseEnter={() => setHover(i)}
              className="cursor-default"
            >
              <rect
                x={padL + step * i}
                y={padT}
                width={step}
                height={chartH}
                fill="transparent"
              />
              <rect
                x={x - barW - 1}
                y={y(b.income)}
                width={barW}
                height={Math.max(0, padT + chartH - y(b.income))}
                fill="hsl(var(--tint-400))"
                opacity={hover === null || active ? 1 : 0.5}
              />
              <rect
                x={x + 1}
                y={y(b.expense)}
                width={barW}
                height={Math.max(0, padT + chartH - y(b.expense))}
                fill="hsl(var(--pending-foreground))"
                opacity={hover === null || active ? 1 : 0.5}
              />
              <text
                x={x}
                y={H - 10}
                textAnchor="middle"
                className="fill-muted-foreground text-[10px] capitalize"
              >
                {monthShort(b.month).replace(/\.$/, "")}
              </text>
            </g>
          );
        })}

        {/* cumulative savings line */}
        <path
          d={linePath}
          fill="none"
          stroke="hsl(var(--foreground))"
          strokeWidth={1.75}
          strokeLinejoin="round"
        />
        {cumulative.map((v, i) => (
          <circle
            key={i}
            cx={padL + step * i + step / 2}
            cy={cy(v)}
            r={hover === i ? 3.5 : 2}
            fill="hsl(var(--background))"
            stroke="hsl(var(--foreground))"
            strokeWidth={1.5}
          />
        ))}

        {hover !== null && (
          <line
            x1={padL + step * hover + step / 2}
            y1={padT}
            x2={padL + step * hover + step / 2}
            y2={padT + chartH}
            stroke="hsl(var(--foreground))"
            strokeDasharray="2 3"
            opacity={0.3}
          />
        )}
      </svg>
      {hover !== null && (
        <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded-xl bg-secondary/60 px-3 py-2 text-[13px]">
          <span className="font-semibold capitalize">
            {monthLabel(bars[hover].month, { long: true })}
          </span>
          <span className="tabular-nums">
            Revenus{" "}
            <b style={{ color: "hsl(var(--tint-400))" }}>
              {formatMoney(bars[hover].income)}
            </b>
          </span>
          <span className="tabular-nums">
            Dépenses{" "}
            <b className="text-pending-foreground">
              {formatMoney(bars[hover].expense)}
            </b>
          </span>
          <span className="tabular-nums">
            Solde{" "}
            <b
              className={cn(
                bars[hover].income - bars[hover].expense < 0 &&
                  "text-negative-foreground"
              )}
            >
              {formatMoney(bars[hover].income - bars[hover].expense)}
            </b>
          </span>
          <span className="tabular-nums text-muted-foreground">
            Cumul {formatMoney(cumulative[hover])}
          </span>
        </div>
      )}
    </div>
  );
}

function Sparkline({ values, color }: { values: number[]; color: string }) {
  const W = 200;
  const H = 22;
  const max = Math.max(1, ...values);
  const step = W / Math.max(1, values.length);
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="h-[22px] w-full"
      aria-hidden
    >
      {values.map((v, i) => (
        <rect
          key={i}
          x={i * step + 1}
          y={H - Math.max(1, (v / max) * H)}
          width={Math.max(1, step - 2)}
          height={Math.max(1, (v / max) * H)}
          rx={1}
          fill={color}
          opacity={v ? 1 : 0.15}
        />
      ))}
    </svg>
  );
}

/** Ranked donut: each category as an arc, sized by its share of the total. */
function CategoryDonut({
  rows,
  totalCents,
}: {
  rows: { id: string; label: string; color: string; spentCents: number }[];
  totalCents: number;
}) {
  const [hover, setHover] = useState<string | null>(null);
  if (!rows.length || !totalCents)
    return (
      <p className="mt-4 text-[14px] text-muted-foreground">Rien à afficher.</p>
    );
  const R = 68;
  const r = 46;
  const cx = 84;
  const cy = 84;
  let start = -Math.PI / 2;
  const arcs = rows.map((row) => {
    const angle = (row.spentCents / totalCents) * Math.PI * 2;
    const large = angle > Math.PI ? 1 : 0;
    const x1 = cx + R * Math.cos(start);
    const y1 = cy + R * Math.sin(start);
    const x2 = cx + R * Math.cos(start + angle);
    const y2 = cy + R * Math.sin(start + angle);
    const x3 = cx + r * Math.cos(start + angle);
    const y3 = cy + r * Math.sin(start + angle);
    const x4 = cx + r * Math.cos(start);
    const y4 = cy + r * Math.sin(start);
    const d = `M${x1},${y1} A${R},${R} 0 ${large},1 ${x2},${y2} L${x3},${y3} A${r},${r} 0 ${large},0 ${x4},${y4} Z`;
    start += angle;
    return { row, d };
  });
  const shown = hover ? rows.find((r) => r.id === hover) : null;
  return (
    <div className="mt-4 grid grid-cols-[168px_minmax(0,1fr)] items-start gap-5">
      <div className="relative">
        <svg viewBox="0 0 168 168" className="h-[168px] w-[168px]">
          {arcs.map(({ row, d }) => (
            <path
              key={row.id}
              d={d}
              fill={row.color}
              opacity={hover === null || hover === row.id ? 1 : 0.35}
              onMouseEnter={() => setHover(row.id)}
              onMouseLeave={() => setHover(null)}
            />
          ))}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          {shown ? (
            <>
              <span className="text-[10px] uppercase tracking-label text-muted-foreground">
                {shown.label}
              </span>
              <span className="text-[15px] font-bold tabular-nums">
                {formatMoney(shown.spentCents)}
              </span>
              <span className="text-[11px] tabular-nums text-muted-foreground">
                {Math.round((shown.spentCents / totalCents) * 100)}%
              </span>
            </>
          ) : (
            <>
              <span className="text-[10px] uppercase tracking-label text-muted-foreground">
                Total
              </span>
              <span className="text-[15px] font-bold tabular-nums">
                {formatMoney(totalCents)}
              </span>
            </>
          )}
        </div>
      </div>
      <ul className="max-h-[168px] space-y-1.5 overflow-y-auto pr-1">
        {rows.slice(0, 8).map((row) => (
          <li
            key={row.id}
            onMouseEnter={() => setHover(row.id)}
            onMouseLeave={() => setHover(null)}
            className={cn(
              "flex items-baseline gap-2 rounded-lg px-1.5 py-1 text-[12px]",
              hover === row.id && "bg-secondary/60"
            )}
          >
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: row.color }}
            />
            <span className="min-w-0 flex-1 truncate">{row.label}</span>
            <span className="tabular-nums text-muted-foreground">
              {Math.round((row.spentCents / totalCents) * 100)}%
            </span>
          </li>
        ))}
        {rows.length > 8 && (
          <li className="px-1.5 pt-1 text-[11px] text-muted-foreground">
            + {rows.length - 8} autres catégories
          </li>
        )}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------- transactions list */

function TransactionsList({
  invoices,
  onOpenInvoice,
  monthLabel,
}: {
  invoices: InvoiceView[];
  onOpenInvoice: (inv: InvoiceView) => void;
  monthLabel: string;
}) {
  if (invoices.length === 0)
    return (
      <p className="mt-4 text-[14px] text-muted-foreground">
        Aucune pour {monthLabel}.
      </p>
    );
  return (
    <TransactionRows
      className="mt-3"
      invoices={[...invoices].sort((a, b) =>
        String(b.date).localeCompare(String(a.date))
      )}
      onOpenInvoice={onOpenInvoice}
    />
  );
}

/** One clickable line per transaction, in the order given. */
function TransactionRows({
  invoices,
  onOpenInvoice,
  className,
}: {
  invoices: InvoiceView[];
  onOpenInvoice: (inv: InvoiceView) => void;
  className?: string;
}) {
  return (
    <ul className={cn("divide-y divide-border", className)}>
      {invoices.map((inv) => {
          const income = inv.direction === "revenu";
          const cat = personalCategory(inv.category);
          return (
            <li key={inv.id}>
              <button
                type="button"
                onClick={() => onOpenInvoice(inv)}
                className="flex w-full items-center gap-3 py-2.5 text-left"
              >
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                  style={{
                    backgroundColor: cat?.color ?? "hsl(var(--secondary))",
                  }}
                >
                  {income ? (
                    <ArrowDownLeft className="h-3.5 w-3.5 text-[#19181c]" />
                  ) : (
                    <ArrowUpRight className="h-3.5 w-3.5 text-[#19181c]" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 truncate text-[14px] font-medium">
                    {inv.party || inv.description || "Sans nom"}
                    {inv.hasFile && (
                      <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground" />
                    )}
                  </span>
                  <span className="block truncate text-[12px] text-muted-foreground">
                    {formatDay(new Date(inv.date), { short: true })} ·{" "}
                    {categoryLabel(inv.direction, inv.category)}
                  </span>
                </span>
                <span
                  className={cn(
                    "text-[14px] font-semibold tabular-nums",
                    income && "text-positive-foreground"
                  )}
                >
                  {income ? "+" : "−"}
                  {formatMoney(inv.totalCents || inv.subtotalCents)}
                </span>
              </button>
            </li>
          );
        })}
    </ul>
  );
}

/* ------------------------------------------------------ period transactions list */

const PAGE = 100;

/**
 * Every transaction of a year or of the whole history, one line each and
 * grouped by month: search by name, filter by direction or category.
 */
function PeriodTransactions({
  invoices,
  months,
  onOpenInvoice,
}: {
  invoices: InvoiceView[];
  months: string[];
  onOpenInvoice: (inv: InvoiceView) => void;
}) {
  const [query, setQuery] = useState("");
  const [direction, setDirection] = useState<"all" | "depense" | "revenu">(
    "all"
  );
  const [category, setCategory] = useState("");
  const [shown, setShown] = useState(PAGE);

  const inPeriod = useMemo(() => {
    const set = new Set(months);
    return invoices
      .filter((i) => set.has(i.date.slice(0, 7)))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [invoices, months]);

  const categories = useMemo(() => {
    const seen = new Map<string, string>();
    for (const i of inPeriod) {
      const id = i.category || "";
      if (!seen.has(id)) seen.set(id, categoryLabel(i.direction, i.category));
    }
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [inPeriod]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return inPeriod.filter(
      (i) =>
        (direction === "all" || i.direction === direction) &&
        (!category || (i.category || "") === category) &&
        (!q ||
          [i.party, i.description, i.notes]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(q)) ||
          centsToInput(i.totalCents || i.subtotalCents).includes(q))
    );
  }, [inPeriod, query, direction, category]);

  useEffect(() => setShown(PAGE), [query, direction, category, months]);

  const sum = rows.reduce(
    (a, i) =>
      a + (i.direction === "revenu" ? 1 : -1) * (i.totalCents || i.subtotalCents),
    0
  );

  // Month headers between groups.
  const groups: { month: string; items: InvoiceView[] }[] = [];
  for (const i of rows.slice(0, shown)) {
    const m = i.date.slice(0, 7);
    const last = groups[groups.length - 1];
    if (last?.month === m) last.items.push(i);
    else groups.push({ month: m, items: [i] });
  }

  return (
    <section className="tile p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-[20px] font-bold tracking-title">
          Transactions
          <span className="ml-2 text-[13px] font-normal text-muted-foreground">
            · {rows.length} ligne{rows.length > 1 ? "s" : ""} ·{" "}
            <span
              className={cn(
                "tabular-nums",
                sum < 0 ? "text-negative-foreground" : "text-positive-foreground"
              )}
            >
              {sum < 0 ? "−" : "+"}
              {formatMoney(Math.abs(sum))}
            </span>
          </span>
        </h2>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher un nom, un montant…"
          className="h-9 min-w-0 flex-1 basis-48"
        />
        <div className="segmented h-9">
          {(
            [
              ["all", "Tout"],
              ["depense", "Dépenses"],
              ["revenu", "Revenus"],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              type="button"
              className="segmented-item h-7 text-[13px]"
              data-active={direction === v}
              onClick={() => setDirection(v)}
            >
              {label}
            </button>
          ))}
        </div>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          aria-label="Catégorie"
          className="h-9 rounded-xl border border-input bg-background px-2 text-[13px]"
        >
          <option value="">Toutes les catégories</option>
          {categories.map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {rows.length === 0 ? (
        <p className="mt-4 text-[14px] text-muted-foreground">
          Aucune transaction ne correspond.
        </p>
      ) : (
        <div className="mt-2">
          {groups.map((g) => (
            <div key={g.month}>
              <p className="mt-4 text-[11px] font-semibold uppercase tracking-label text-muted-foreground">
                {monthLabel(g.month, { long: true })}
              </p>
              <TransactionRows invoices={g.items} onOpenInvoice={onOpenInvoice} />
            </div>
          ))}
          {rows.length > shown && (
            <div className="mt-4 flex justify-center">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setShown((n) => n + PAGE)}
              >
                Voir plus ({rows.length - shown})
              </Button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/* ---------------------------------------------------------- stat card with delta */

function Stat({
  label,
  value,
  hint,
  tone,
  delta,
  deltaFlip = false,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "neg" | "pos";
  delta?: number | null;
  /** True when a smaller number is the good one (e.g. expenses). */
  deltaFlip?: boolean;
}) {
  const good =
    delta === null || delta === undefined || delta === 0
      ? null
      : delta > 0
        ? !deltaFlip
        : deltaFlip;
  const arrow =
    delta === null || delta === undefined || delta === 0
      ? null
      : delta > 0
        ? "+"
        : "−";
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
      {arrow !== null ? (
        <p
          className={cn(
            "mt-1 text-[11px] tabular-nums",
            good === true && "text-positive-foreground",
            good === false && "text-negative-foreground",
            good === null && "text-muted-foreground"
          )}
        >
          {arrow} {formatMoney(Math.abs(delta as number))} vs période préc.
        </p>
      ) : hint ? (
        <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

/* --------------------------------------------------------------- budget dialog */

function useAverages(invoices: InvoiceView[], month: string) {
  return useMemo(() => {
    const out: Record<string, number> = {};
    for (const n of [1, 2, 3]) {
      for (const l of monthSummary(invoices, {}, shiftMonth(month, -n)).lines) {
        out[l.id] = (out[l.id] ?? 0) + l.spentCents / 3;
      }
    }
    return out;
  }, [invoices, month]);
}

function BudgetDialog({
  open,
  onOpenChange,
  organisationId,
  budgets,
  averages,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organisationId: string;
  budgets: Budgets;
  averages: Record<string, number>;
  onSaved: (budgets: Budgets) => void;
}) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraft(
      Object.fromEntries(
        PERSONAL_EXPENSE_CATEGORIES.map((c) => [
          c.id,
          budgets[c.id] ? centsToInput(budgets[c.id]) : "",
        ])
      )
    );
  }, [open, budgets]);

  const total = Object.values(draft).reduce(
    (a, v) => a + (parseMoney(v) ?? 0),
    0
  );

  const save = async () => {
    const next: Budgets = {};
    for (const [id, v] of Object.entries(draft)) {
      const cents = parseMoney(v);
      if (cents && cents > 0) next[id] = cents;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/fiscalite/profiles/${organisationId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ budgets: next }),
      });
      if (!res.ok) throw new Error(`Erreur ${res.status}`);
      onSaved(next);
      onOpenChange(false);
      toast.success("Budget enregistré.");
    } catch (e) {
      toast.error("Enregistrement impossible", {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Budget du mois</DialogTitle>
          <DialogDescription>
            Combien tu veux mettre par mois dans chaque catégorie. À droite, ta
            moyenne des trois derniers mois.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          {PERSONAL_EXPENSE_CATEGORIES.map((c) => (
            <div key={c.id} className="flex items-center gap-3">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: c.color }}
              />
              <span className="min-w-0 flex-1 truncate text-[14px]">
                {c.label}
              </span>
              {averages[c.id] ? (
                <button
                  type="button"
                  className="text-[12px] tabular-nums text-muted-foreground underline-offset-2 hover:underline"
                  title="Utiliser la moyenne"
                  onClick={() =>
                    setDraft((d) => ({
                      ...d,
                      [c.id]: centsToInput(
                        Math.round(averages[c.id] / 100) * 100
                      ),
                    }))
                  }
                >
                  moy. {formatMoney(Math.round(averages[c.id]))}
                </button>
              ) : null}
              <Input
                aria-label={c.label}
                inputMode="decimal"
                value={draft[c.id] ?? ""}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, [c.id]: e.target.value }))
                }
                placeholder="0"
                className="h-9 w-28 text-right tabular-nums"
              />
            </div>
          ))}
          <div className="flex items-center justify-between border-t border-border pt-4">
            <span className="text-[14px]">
              Total <b className="tabular-nums">{formatMoney(total)}</b> / mois
            </span>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="animate-spin" />}
              Enregistrer
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
