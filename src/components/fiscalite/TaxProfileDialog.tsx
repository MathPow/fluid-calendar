"use client";

import { useEffect, useState } from "react";

import { Loader2 } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";

import { cn } from "@/lib/utils";

import {
  FILING_FREQUENCIES,
  LEGAL_FORMS,
  SALES_TAX_STATUSES,
  type TaxProfileLite,
} from "@/lib/fiscalite/meta";

export type ProfileView = TaxProfileLite & { organisationId: string; notes: string | null };

interface TaxProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organisation: { id: string; name: string };
  profile: ProfileView | null;
  onSaved: (profile: ProfileView) => void;
}

function Choice<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { id: T; label: string; hint?: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className={cn("grid gap-2", options.length === 3 ? "grid-cols-3" : "sm:grid-cols-2")}>
      {options.map((o) => {
        const active = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.id)}
            className={cn(
              "rounded-2xl border-2 px-4 py-3 text-left transition-colors",
              active ? "border-foreground bg-tint-soft" : "border-transparent bg-secondary hover:bg-border/70"
            )}
          >
            <span className="block text-[14px] font-semibold tracking-title">{o.label}</span>
            {o.hint && <span className="block text-[12px] text-muted-foreground">{o.hint}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** How a company is set up for tax: the answers the whole guide hangs on. */
export function TaxProfileDialog({ open, onOpenChange, organisation, profile, onSaved }: TaxProfileDialogProps) {
  const [legalForm, setLegalForm] = useState<"individuelle" | "societe">("individuelle");
  const [status, setStatus] = useState<"petit" | "inscrit">("petit");
  const [gstNumber, setGst] = useState("");
  const [qstNumber, setQst] = useState("");
  const [frequency, setFrequency] = useState<"annuelle" | "trimestrielle" | "mensuelle">("annuelle");
  const [yearEnd, setYearEnd] = useState("12-31");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLegalForm(profile?.legalForm === "societe" ? "societe" : "individuelle");
    setStatus(profile?.salesTaxStatus === "inscrit" ? "inscrit" : "petit");
    setGst(profile?.gstNumber ?? "");
    setQst(profile?.qstNumber ?? "");
    setFrequency((profile?.filingFrequency as typeof frequency) ?? "annuelle");
    setYearEnd(profile?.fiscalYearEnd ?? "12-31");
    setNotes(profile?.notes ?? "");
  }, [open, profile]);

  const submit = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/fiscalite/profiles/${organisation.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          legalForm,
          salesTaxStatus: status,
          gstNumber,
          qstNumber,
          filingFrequency: frequency,
          fiscalYearEnd: legalForm === "societe" ? yearEnd : "12-31",
          notes,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as ProfileView & { error?: string };
      if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
      toast.success("Profil fiscal enregistré.");
      onSaved(data);
      onOpenChange(false);
    } catch (e) {
      toast.error("Enregistrement impossible", {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const [mm, dd] = yearEnd.split("-");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Profil fiscal · {organisation.name}</DialogTitle>
          <DialogDescription>
            Trois réponses suffisent pour que le guide calcule tes échéances et tes taxes.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-6"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="space-y-2">
            <Label>1 · Comment l&apos;entreprise est constituée</Label>
            <Choice options={LEGAL_FORMS} value={legalForm} onChange={setLegalForm} />
            <p className="text-[12px] text-muted-foreground">
              Pas de « inc. » ni de NEQ de société ? C&apos;est une entreprise individuelle, même
              immatriculée au REQ sous un nom.
            </p>
          </div>

          {legalForm === "societe" && (
            <div className="space-y-2">
              <Label>Fin d&apos;exercice</Label>
              <div className="flex gap-2">
                <Input
                  aria-label="Jour"
                  inputMode="numeric"
                  value={dd}
                  onChange={(e) => setYearEnd(`${mm}-${e.target.value.replace(/\D/g, "").slice(0, 2).padStart(2, "0")}`)}
                  className="w-20"
                />
                <select
                  aria-label="Mois"
                  value={mm}
                  onChange={(e) => setYearEnd(`${e.target.value}-${dd}`)}
                  className="h-10 flex-1 rounded-xl border border-input bg-background px-3 text-[14px]"
                >
                  {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0")).map((m) => (
                    <option key={m} value={m}>
                      {new Intl.DateTimeFormat("fr-CA", { month: "long", timeZone: "UTC" }).format(
                        new Date(Date.UTC(2026, Number(m) - 1, 1))
                      )}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label>2 · TPS / TVQ</Label>
            <Choice options={SALES_TAX_STATUSES} value={status} onChange={setStatus} />
            <p className="text-[12px] text-muted-foreground">
              Obligatoire dès que tes ventes taxables dépassent 30 000 $ sur quatre trimestres. En
              dessous, t&apos;inscrire quand même te laisse récupérer les taxes sur tes achats.
            </p>
          </div>

          {status === "inscrit" && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="tp-gst">No TPS</Label>
                  <Input id="tp-gst" value={gstNumber} onChange={(e) => setGst(e.target.value)} placeholder="123456789RT0001" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tp-qst">No TVQ</Label>
                  <Input id="tp-qst" value={qstNumber} onChange={(e) => setQst(e.target.value)} placeholder="1234567890TQ0001" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>3 · Fréquence des déclarations de taxes</Label>
                <Choice options={FILING_FREQUENCIES} value={frequency} onChange={setFrequency} />
                <p className="text-[12px] text-muted-foreground">
                  Elle est sur ton avis d&apos;inscription (Mon dossier, Revenu Québec). Moins de 1,5 M$
                  de ventes: annuelle par défaut.
                </p>
              </div>
            </>
          )}

          <div className="space-y-2">
            <Label htmlFor="tp-notes">Notes</Label>
            <Textarea
              id="tp-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="NEQ, nom du comptable, particularités…"
            />
          </div>

          <div className="flex justify-end">
            <Button type="submit" size="lg" disabled={submitting}>
              {submitting && <Loader2 className="animate-spin" />}
              Enregistrer
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
