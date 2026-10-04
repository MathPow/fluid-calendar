"use client";

import { useState } from "react";

import { ArrowRight, Check, Loader2, Plus, X } from "lucide-react";
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
import { Label } from "@/components/ui/label";

import { type TranslateFn, useT } from "@/i18n";
import { cn } from "@/lib/utils";

import {
  MOVEMENT_KINDS,
  type MovementKind,
  type PartnerSummary,
  type Settlement,
  formatDay,
  formatMoney,
  parseMoney,
  settlements as computeSettlements,
} from "@/lib/fiscalite/meta";
import type { MovementView } from "@/lib/fiscalite/queries";

interface PartnersTileProps {
  organisationId: string;
  partners: string[];
  summaries: PartnerSummary[];
  movements: MovementView[];
  onAdded: (m: MovementView) => void;
  onDeleted: (id: string) => void;
}

const kindLabel = (t: TranslateFn, k: string) =>
  MOVEMENT_KINDS.some((m) => m.id === k) ? t(`fiscalite.movementKind.${k}.label`) : k;

/**
 * SENC: what each associé paid out of pocket, advanced, got back and drew,
 * and his equal share of the estimated profit.
 */
export function PartnersTile({ organisationId, partners, summaries, movements, onAdded, onDeleted }: PartnersTileProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [settling, setSettling] = useState<string | null>(null);
  const transfers = computeSettlements(summaries);

  const settle = async (s: Settlement) => {
    setSettling(`${s.from}:${s.to}`);
    try {
      const res = await fetch("/api/fiscalite/movements/settle", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ organisationId, from: s.from, to: s.to, amountCents: s.amountCents }),
      });
      const data = (await res.json().catch(() => null)) as MovementView[] | { error?: string } | null;
      if (!res.ok || !Array.isArray(data)) {
        throw new Error((data as { error?: string } | null)?.error || t("common.error", { status: res.status }));
      }
      for (const m of data) onAdded(m);
      toast.success(t("fiscalite.partners.settleDone", { amount: formatMoney(s.amountCents) }));
    } catch (e) {
      toast.error(t("fiscalite.partners.settleFailed"), { description: e instanceof Error ? e.message : undefined });
    } finally {
      setSettling(null);
    }
  };

  const remove = async (m: MovementView) => {
    if (
      !window.confirm(
        t("fiscalite.partners.confirmDelete", {
          kind: kindLabel(t, m.kind).toLowerCase(),
          amount: formatMoney(m.amountCents),
        })
      )
    )
      return;
    const res = await fetch(`/api/fiscalite/movements/${m.id}`, { method: "DELETE" });
    if (res.ok) onDeleted(m.id);
    else toast.error(t("toasts.fiscalite.deleteFailed"));
  };

  return (
    <section className="tile p-6">
      <div className="flex items-center justify-between gap-3">
        <p className="etiquette">{t("fiscalite.profile.partners")}</p>
        <Button size="sm" variant="secondary" onClick={() => setOpen(true)} disabled={!partners.length}>
          <Plus /> {t("fiscalite.partners.movement")}
        </Button>
      </div>

      {summaries.length === 0 ? (
        <p className="mt-4 text-[13px] text-muted-foreground">
          {t("fiscalite.partners.empty")}
        </p>
      ) : (
        <ul className="mt-4 space-y-4">
          {summaries.map((s) => (
            <li key={s.partner}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[15px] font-semibold tracking-title">{s.partner}</span>
                <span
                  className={cn(
                    "text-[15px] font-semibold tabular-nums",
                    s.balanceCents > 0 && "text-pending-foreground"
                  )}
                >
                  {s.balanceCents >= 0 ? t("fiscalite.partners.owedTo") : t("fiscalite.partners.owes")}{" "}
                  {formatMoney(Math.abs(s.balanceCents))}
                </span>
              </div>
              <dl className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[12px] text-muted-foreground">
                <dt>{t("fiscalite.partners.paidInvoices")}</dt>
                <dd className="text-right tabular-nums">{formatMoney(s.paidCents)}</dd>
                <dt>{t("fiscalite.partners.advances")}</dt>
                <dd className="text-right tabular-nums">{formatMoney(s.advancedCents)}</dd>
                <dt>{t("fiscalite.partners.reimbursed")}</dt>
                <dd className="text-right tabular-nums">−{formatMoney(s.reimbursedCents)}</dd>
                <dt>{t("fiscalite.partners.draws")}</dt>
                <dd className="text-right tabular-nums">{formatMoney(s.drawsCents)}</dd>
                <dt className="font-medium text-foreground">
                  {t("fiscalite.partners.profitShare", { pct: Math.round(s.sharePct * 10) / 10 })}
                </dt>
                <dd className="text-right font-medium tabular-nums text-foreground">
                  {formatMoney(s.profitShareCents)}
                </dd>
              </dl>
            </li>
          ))}
        </ul>
      )}

      {transfers.length > 0 && (
        <>
          <div className="filet my-4" />
          <p className="etiquette">{t("fiscalite.partners.settlements")}</p>
          <p className="mt-1 text-[12px] text-muted-foreground">
            {t("fiscalite.partners.settlementsHint")}
          </p>
          <ul className="mt-3 space-y-2">
            {transfers.map((s) => (
              <li key={`${s.from}-${s.to}`} className="flex flex-wrap items-center gap-2 rounded-xl bg-tint-soft px-3 py-2.5">
                <span className="flex items-baseline gap-1.5 text-[14px]">
                  <span className="font-semibold">{s.from}</span>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="font-semibold">{s.to}</span>
                </span>
                <span className="ml-auto tabular-nums text-[15px] font-semibold">
                  {formatMoney(s.amountCents)}
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => settle(s)}
                  disabled={settling === `${s.from}:${s.to}`}
                >
                  {settling === `${s.from}:${s.to}` ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <Check />
                  )}
                  {t("fiscalite.partners.markSettled")}
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}

      {movements.length > 0 && (
        <>
          <div className="filet my-4" />
          <ul className="space-y-1.5">
            {movements.slice(0, 8).map((m) => (
              <li key={m.id} className="group flex items-center gap-2 text-[13px]">
                <span className="w-14 shrink-0 tabular-nums text-muted-foreground">
                  {formatDay(new Date(m.date), { short: true })}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {kindLabel(t, m.kind)} · {m.partner}
                  {m.notes ? <span className="text-muted-foreground"> · {m.notes}</span> : null}
                </span>
                <span className="tabular-nums">{formatMoney(m.amountCents)}</span>
                <button
                  type="button"
                  onClick={() => remove(m)}
                  aria-label={t("common.delete")}
                  className="text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="mt-4 text-[12px] leading-relaxed text-muted-foreground">
        {t("fiscalite.partners.footnote")}
      </p>

      <MovementDialog
        open={open}
        onOpenChange={setOpen}
        organisationId={organisationId}
        partners={partners}
        onSaved={onAdded}
      />
    </section>
  );
}

function MovementDialog({
  open,
  onOpenChange,
  organisationId,
  partners,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organisationId: string;
  partners: string[];
  onSaved: (m: MovementView) => void;
}) {
  const t = useT();
  const [kind, setKind] = useState<MovementKind>("avance");
  const [partner, setPartner] = useState("");
  const [date, setDate] = useState(() => new Date().toLocaleDateString("en-CA"));
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const who = partner || partners[0] || "";

  const submit = async () => {
    const cents = parseMoney(amount);
    if (!cents || cents <= 0) {
      toast.error(t("toasts.fiscalite.invalidAmount"));
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/fiscalite/movements", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ organisationId, date, kind, partner: who, amountCents: cents, notes }),
      });
      const data = (await res.json().catch(() => ({}))) as MovementView & { error?: string };
      if (!res.ok) throw new Error(data.error || t("common.error", { status: res.status }));
      onSaved(data);
      setAmount("");
      setNotes("");
      onOpenChange(false);
    } catch (e) {
      toast.error(t("toasts.common.saveFailed"), {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const chip = (active: boolean) =>
    cn(
      "rounded-full border-2 px-4 py-1.5 text-[13px] font-medium transition-colors",
      active ? "border-foreground bg-tint-soft" : "border-transparent bg-secondary hover:bg-border/70"
    );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("fiscalite.partners.dialog.title")}</DialogTitle>
          <DialogDescription>
            {t("fiscalite.partners.dialog.description")}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="space-y-2">
            <Label>{t("fiscalite.partners.dialog.type")}</Label>
            <div className="grid gap-2">
              {MOVEMENT_KINDS.map((k) => (
                <button
                  key={k.id}
                  type="button"
                  aria-pressed={kind === k.id}
                  onClick={() => setKind(k.id)}
                  className={cn(chip(kind === k.id), "rounded-2xl px-4 py-2 text-left")}
                >
                  <span className="block font-semibold">{t(`fiscalite.movementKind.${k.id}.label`)}</span>
                  <span className="block text-[12px] font-normal text-muted-foreground">{t(`fiscalite.movementKind.${k.id}.hint`)}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label>{t("fiscalite.partners.dialog.partner")}</Label>
            <div className="flex flex-wrap gap-2">
              {partners.map((p) => (
                <button key={p} type="button" aria-pressed={who === p} onClick={() => setPartner(p)} className={chip(who === p)}>
                  {p}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="mv-date">{t("fiscalite.partners.dialog.date")}</Label>
              <Input id="mv-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mv-amount">{t("fiscalite.partners.dialog.amount")}</Label>
              <Input
                id="mv-amount"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="tabular-nums"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="mv-notes">{t("fiscalite.partners.dialog.notes")}</Label>
            <Input id="mv-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="flex justify-end">
            <Button type="submit" size="lg" disabled={submitting || !who}>
              {submitting && <Loader2 className="animate-spin" />}
              {t("common.add")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
