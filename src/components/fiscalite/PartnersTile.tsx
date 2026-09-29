"use client";

import { useState } from "react";

import { Loader2, Plus, X } from "lucide-react";
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

import { cn } from "@/lib/utils";

import {
  MOVEMENT_KINDS,
  type MovementKind,
  type PartnerSummary,
  formatDay,
  formatMoney,
  parseMoney,
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

const kindLabel = (k: string) => MOVEMENT_KINDS.find((m) => m.id === k)?.label ?? k;

/**
 * SENC: what each associé paid out of pocket, advanced, got back and drew,
 * and his equal share of the estimated profit.
 */
export function PartnersTile({ organisationId, partners, summaries, movements, onAdded, onDeleted }: PartnersTileProps) {
  const [open, setOpen] = useState(false);

  const remove = async (m: MovementView) => {
    if (!window.confirm(`Supprimer ce ${kindLabel(m.kind).toLowerCase()} de ${formatMoney(m.amountCents)} ?`)) return;
    const res = await fetch(`/api/fiscalite/movements/${m.id}`, { method: "DELETE" });
    if (res.ok) onDeleted(m.id);
    else toast.error("Suppression impossible");
  };

  return (
    <section className="tile p-6">
      <div className="flex items-center justify-between gap-3">
        <p className="etiquette">Associés</p>
        <Button size="sm" variant="secondary" onClick={() => setOpen(true)} disabled={!partners.length}>
          <Plus /> Mouvement
        </Button>
      </div>

      {summaries.length === 0 ? (
        <p className="mt-4 text-[13px] text-muted-foreground">
          Ajoute les associés dans le profil fiscal pour suivre leurs avances et leurs retraits.
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
                  {s.balanceCents >= 0 ? "On lui doit " : "Il doit "}
                  {formatMoney(Math.abs(s.balanceCents))}
                </span>
              </div>
              <dl className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[12px] text-muted-foreground">
                <dt>Factures payées</dt>
                <dd className="text-right tabular-nums">{formatMoney(s.paidCents)}</dd>
                <dt>Avances</dt>
                <dd className="text-right tabular-nums">{formatMoney(s.advancedCents)}</dd>
                <dt>Remboursé</dt>
                <dd className="text-right tabular-nums">−{formatMoney(s.reimbursedCents)}</dd>
                <dt>Retraits</dt>
                <dd className="text-right tabular-nums">{formatMoney(s.drawsCents)}</dd>
                <dt className="font-medium text-foreground">
                  Part du bénéfice ({Math.round(s.sharePct * 10) / 10} %)
                </dt>
                <dd className="text-right font-medium tabular-nums text-foreground">
                  {formatMoney(s.profitShareCents)}
                </dd>
              </dl>
            </li>
          ))}
        </ul>
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
                  {kindLabel(m.kind)} · {m.partner}
                  {m.notes ? <span className="text-muted-foreground"> · {m.notes}</span> : null}
                </span>
                <span className="tabular-nums">{formatMoney(m.amountCents)}</span>
                <button
                  type="button"
                  onClick={() => remove(m)}
                  aria-label="Supprimer"
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
        Une dépense qu&apos;un associé garde à sa charge (non remboursée, ex. son auto) ne passe pas
        ici: il la déduit lui-même de sa part (ligne 9943 de sa T2125).
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
      toast.error("Montant invalide.");
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
      if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
      onSaved(data);
      setAmount("");
      setNotes("");
      onOpenChange(false);
    } catch (e) {
      toast.error("Enregistrement impossible", {
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
          <DialogTitle>Mouvement d&apos;associé</DialogTitle>
          <DialogDescription>
            Une facture payée de sa poche se note plutôt avec « Payé par » sur la facture.
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
            <Label>Type</Label>
            <div className="grid gap-2">
              {MOVEMENT_KINDS.map((k) => (
                <button
                  key={k.id}
                  type="button"
                  aria-pressed={kind === k.id}
                  onClick={() => setKind(k.id)}
                  className={cn(chip(kind === k.id), "rounded-2xl px-4 py-2 text-left")}
                >
                  <span className="block font-semibold">{k.label}</span>
                  <span className="block text-[12px] font-normal text-muted-foreground">{k.hint}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Associé</Label>
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
              <Label htmlFor="mv-date">Date</Label>
              <Input id="mv-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mv-amount">Montant</Label>
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
            <Label htmlFor="mv-notes">Commentaire</Label>
            <Input id="mv-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="flex justify-end">
            <Button type="submit" size="lg" disabled={submitting || !who}>
              {submitting && <Loader2 className="animate-spin" />}
              Ajouter
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
