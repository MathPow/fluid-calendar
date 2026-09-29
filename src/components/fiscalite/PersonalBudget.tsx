"use client";

import { useEffect, useMemo, useState } from "react";

import { ArrowDownLeft, ArrowUpRight, ChevronLeft, ChevronRight, Loader2, Paperclip, Pencil, Settings2 } from "lucide-react";
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

import { cn } from "@/lib/utils";

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

import { ExcelActions } from "./ExcelActions";

interface PersonalBudgetProps {
  organisation: { id: string; name: string };
  invoices: InvoiceView[];
  budgets: Budgets;
  onOpenInvoice: (invoice: InvoiceView) => void;
  onEditProfile: () => void;
  onBudgetsSaved: (budgets: Budgets) => void;
}

const thisMonth = () => new Date().toLocaleDateString("en-CA").slice(0, 7);

function shiftMonth(month: string, n: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

function monthLabel(month: string) {
  const [y, m] = month.split("-").map(Number);
  const s = new Intl.DateTimeFormat("fr-CA", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, 1))
  );
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Budget perso: the month's income and spending against a budget per
 * category. Same receipts as the business side (drop a PDF or a photo), no
 * tax rules.
 */
export function PersonalBudget({
  organisation,
  invoices,
  budgets,
  onOpenInvoice,
  onEditProfile,
  onBudgetsSaved,
}: PersonalBudgetProps) {
  const [month, setMonth] = useState(thisMonth);
  const [editing, setEditing] = useState(false);
  const s = useMemo(() => monthSummary(invoices, budgets, month), [invoices, budgets, month]);
  const left = s.incomeCents - s.expenseCents;
  const budgetLeft = s.budgetCents - s.lines.reduce((a, l) => a + (l.budgetCents ? l.spentCents : 0), 0);

  // Average spending over the three previous months, to size a budget.
  const averages = useMemo(() => {
    const out: Record<string, number> = {};
    for (const n of [1, 2, 3]) {
      for (const l of monthSummary(invoices, {}, shiftMonth(month, -n)).lines) {
        out[l.id] = (out[l.id] ?? 0) + l.spentCents / 3;
      }
    }
    return out;
  }, [invoices, month]);

  return (
    <div className="mt-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="segmented h-11">
          <button type="button" className="segmented-item h-9 px-2" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Mois précédent">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[150px] px-2 text-center text-[14px] font-semibold">{monthLabel(month)}</span>
          <button type="button" className="segmented-item h-9 px-2" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Mois suivant">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          <ExcelActions organisation={organisation} year={Number(month.slice(0, 4))} />
          <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
            <Pencil /> Budget
          </Button>
          <Button size="sm" variant="ghost" onClick={onEditProfile}>
            <Settings2 /> Profil
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Revenus du mois" value={formatMoney(s.incomeCents)} />
        <Stat label="Dépenses du mois" value={formatMoney(s.expenseCents)} />
        <Stat label="Reste" value={formatMoney(left)} tone={left < 0 ? "neg" : "pos"} />
        <Stat
          label="Budget restant"
          value={s.budgetCents ? formatMoney(budgetLeft) : "—"}
          hint={s.budgetCents ? `sur ${formatMoney(s.budgetCents)}` : "Fixe un budget par catégorie"}
          tone={s.budgetCents && budgetLeft < 0 ? "neg" : undefined}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
        <section className="tile p-5 sm:p-6">
          <h2 className="text-[20px] font-bold tracking-title">Par catégorie</h2>
          {s.lines.length === 0 ? (
            <p className="mt-4 text-[14px] text-muted-foreground">
              Rien ce mois-ci. Dépose un reçu ou fixe ton budget pour commencer.
            </p>
          ) : (
            <ul className="mt-5 space-y-4">
              {s.lines.map((l) => {
                const over = l.budgetCents > 0 && l.spentCents > l.budgetCents;
                const ratio = l.budgetCents ? Math.min(1, l.spentCents / l.budgetCents) : l.spentCents ? 1 : 0;
                return (
                  <li key={l.id}>
                    <div className="flex items-baseline justify-between gap-3 text-[14px]">
                      <span className="flex min-w-0 items-center gap-2 font-medium">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: l.color }} />
                        <span className="truncate">{l.label}</span>
                      </span>
                      <span className={cn("shrink-0 tabular-nums", over && "font-semibold text-negative-foreground")}>
                        {formatMoney(l.spentCents)}
                        {l.budgetCents > 0 && (
                          <span className="font-normal text-muted-foreground"> / {formatMoney(l.budgetCents)}</span>
                        )}
                      </span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-secondary">
                      <div
                        className={cn("h-full rounded-full", over ? "bg-negative" : !l.budgetCents && "opacity-40")}
                        style={{ width: `${ratio * 100}%`, backgroundColor: over ? undefined : l.color }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="tile p-5 sm:p-6">
          <h2 className="text-[20px] font-bold tracking-title">Transactions</h2>
          {s.invoices.length === 0 ? (
            <p className="mt-4 text-[14px] text-muted-foreground">Aucune pour {monthLabel(month).toLowerCase()}.</p>
          ) : (
            <ul className="mt-3 divide-y divide-border">
              {[...s.invoices]
                .sort((a, b) => String(b.date).localeCompare(String(a.date)))
                .map((inv) => {
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
                          style={{ backgroundColor: cat?.color ?? "hsl(var(--secondary))" }}
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
                            {inv.file && <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground" />}
                          </span>
                          <span className="block truncate text-[12px] text-muted-foreground">
                            {formatDay(new Date(inv.date), { short: true })} · {categoryLabel(inv.direction, inv.category)}
                          </span>
                        </span>
                        <span className={cn("text-[14px] font-semibold tabular-nums", income && "text-positive-foreground")}>
                          {income ? "+" : "−"}
                          {formatMoney(inv.totalCents || inv.subtotalCents)}
                        </span>
                      </button>
                    </li>
                  );
                })}
            </ul>
          )}
        </section>
      </div>

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
        PERSONAL_EXPENSE_CATEGORIES.map((c) => [c.id, budgets[c.id] ? centsToInput(budgets[c.id]) : ""])
      )
    );
  }, [open, budgets]);

  const total = Object.values(draft).reduce((a, v) => a + (parseMoney(v) ?? 0), 0);

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
      toast.error("Enregistrement impossible", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Budget du mois</DialogTitle>
          <DialogDescription>
            Combien tu veux mettre par mois dans chaque catégorie. À droite, ta moyenne des trois derniers
            mois.
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
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: c.color }} />
              <span className="min-w-0 flex-1 truncate text-[14px]">{c.label}</span>
              {averages[c.id] ? (
                <button
                  type="button"
                  className="text-[12px] tabular-nums text-muted-foreground underline-offset-2 hover:underline"
                  title="Utiliser la moyenne"
                  onClick={() => setDraft((d) => ({ ...d, [c.id]: centsToInput(Math.round(averages[c.id] / 100) * 100) }))}
                >
                  moy. {formatMoney(Math.round(averages[c.id]))}
                </button>
              ) : null}
              <Input
                aria-label={c.label}
                inputMode="decimal"
                value={draft[c.id] ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, [c.id]: e.target.value }))}
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
