"use client";

import { useEffect, useState } from "react";

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
import { Textarea } from "@/components/ui/textarea";

import {
  FILING_FREQUENCIES,
  LEGAL_FORMS,
  type LegalForm,
  SALES_TAX_STATUSES,
  type TaxProfileLite,
} from "@/lib/fiscalite/meta";
import { cn } from "@/lib/utils";

import { ContactPicker, type PickerContact } from "../projets/ContactPicker";

/** The company file fields, all optional free text. */
export const COMPANY_FIELDS = [
  "legalName",
  "neq",
  "businessNumber",
  "rqNumber",
  "payrollNumber",
  "activity",
  "naicsCode",
  "address",
  "city",
  "province",
  "postalCode",
  "email",
  "phone",
  "website",
  "bank",
  "accountant",
  "accountantEmail",
  "accountantPhone",
] as const;
type CompanyField = (typeof COMPANY_FIELDS)[number];

export type ProfileView = TaxProfileLite & {
  organisationId: string;
  notes: string | null;
  tracked: boolean;
  setUp: boolean;
  partners: string[];
  partnerShares: number[];
  partnerContactIds?: string[];
  budgets?: unknown;
  startedAt: string | null; // YYYY-MM-DD (or an ISO string from the API)
} & { [K in CompanyField]: string | null };

interface TaxProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organisation: { id: string; name: string };
  profile: ProfileView | null;
  onSaved: (profile: ProfileView) => void;
  /** Form preselected when there's no profile yet ("personnel" for the Perso organisation). */
  defaultLegalForm?: LegalForm;
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
    <div
      className={cn(
        "grid gap-2",
        options.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2"
      )}
    >
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
              active
                ? "border-foreground bg-tint-soft"
                : "border-transparent bg-secondary hover:bg-border/70"
            )}
          >
            <span className="block text-[14px] font-semibold tracking-title">
              {o.label}
            </span>
            {o.hint && (
              <span className="block text-[12px] text-muted-foreground">
                {o.hint}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4 border-t border-border pt-6 first:border-t-0 first:pt-0">
      <div>
        <h3 className="text-[16px] font-bold tracking-title">{title}</h3>
        {hint && (
          <p className="mt-0.5 text-[12px] text-muted-foreground">{hint}</p>
        )}
      </div>
      {children}
    </section>
  );
}

const digits = (v: string) => v.replace(/\D/g, "");

/** The company file: identification, contact, tax setup, associés, accountant. */
export function TaxProfileDialog({
  open,
  onOpenChange,
  organisation,
  profile,
  onSaved,
  defaultLegalForm,
}: TaxProfileDialogProps) {
  const [legalForm, setLegalForm] = useState<LegalForm>("individuelle");
  const [partners, setPartners] = useState<
    { name: string; share: string; contactId: string }[]
  >([]);
  const [contacts, setContacts] = useState<PickerContact[]>([]);

  // The associés are picked among the Contacts.
  useEffect(() => {
    if (!open || contacts.length) return;
    fetch("/api/contacts")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: PickerContact[]) => setContacts(rows))
      .catch(() => {});
  }, [open, contacts.length]);
  const [status, setStatus] = useState<"petit" | "inscrit">("petit");
  const [gstNumber, setGst] = useState("");
  const [qstNumber, setQst] = useState("");
  const [frequency, setFrequency] = useState<
    "annuelle" | "trimestrielle" | "mensuelle"
  >("annuelle");
  const [yearEnd, setYearEnd] = useState("12-31");
  const [startedAt, setStartedAt] = useState("");
  const [notes, setNotes] = useState("");
  const [company, setCompany] = useState<Record<CompanyField, string>>(
    () =>
      Object.fromEntries(COMPANY_FIELDS.map((f) => [f, ""])) as Record<
        CompanyField,
        string
      >
  );
  const [submitting, setSubmitting] = useState(false);
  // Budget perso: none of the company file applies.
  const personal = legalForm === "personnel";

  useEffect(() => {
    if (!open) return;
    setLegalForm(
      profile?.legalForm === "societe" || profile?.legalForm === "senc" || profile?.legalForm === "personnel"
        ? profile.legalForm
        : (defaultLegalForm ?? "individuelle")
    );
    setPartners(
      (profile?.partners ?? []).map((name, i) => ({
        name,
        share:
          profile?.partnerShares?.[i] != null
            ? String(profile.partnerShares[i])
            : "",
        contactId: profile?.partnerContactIds?.[i] ?? "",
      }))
    );
    setStatus(profile?.salesTaxStatus === "inscrit" ? "inscrit" : "petit");
    setGst(profile?.gstNumber ?? "");
    setQst(profile?.qstNumber ?? "");
    setFrequency((profile?.filingFrequency as typeof frequency) ?? "annuelle");
    setYearEnd(profile?.fiscalYearEnd ?? "12-31");
    setStartedAt(profile?.startedAt?.slice(0, 10) ?? "");
    setNotes(profile?.notes ?? "");
    setCompany(
      Object.fromEntries(
        COMPANY_FIELDS.map((f) => [
          f,
          profile?.[f] ?? (f === "province" ? "QC" : ""),
        ])
      ) as Record<CompanyField, string>
    );
  }, [open, profile, defaultLegalForm]);

  const field = (f: CompanyField) => ({
    value: company[f],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setCompany((c) => ({ ...c, [f]: e.target.value })),
  });

  const named = partners.filter((p) => p.name.trim());
  const shares = named.map((p) => Number(p.share.replace(",", ".")));
  const sharesSet =
    named.length > 0 && named.every((p) => p.share.trim() !== "");
  const shareTotal = shares.reduce(
    (a, b) => a + (Number.isFinite(b) ? b : 0),
    0
  );

  const warnings: string[] = [];
  if (company.neq && digits(company.neq).length !== 10)
    warnings.push("Le NEQ compte 10 chiffres.");
  if (company.businessNumber && digits(company.businessNumber).length !== 9)
    warnings.push("Le NE fédéral compte 9 chiffres (le début du no TPS).");
  if (
    gstNumber &&
    company.businessNumber &&
    !digits(gstNumber).startsWith(digits(company.businessNumber))
  )
    warnings.push("Le no TPS commence normalement par le NE fédéral.");
  if (legalForm === "senc" && sharesSet && Math.abs(shareTotal - 100) > 0.01)
    warnings.push(
      `Les parts des associés totalisent ${shareTotal} %, pas 100 %.`
    );

  const submit = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/fiscalite/profiles/${organisation.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          legalForm,
          partners: legalForm === "senc" ? named.map((p) => p.name.trim()) : [],
          partnerShares: legalForm === "senc" && sharesSet ? shares : [],
          partnerContactIds:
            legalForm === "senc" ? named.map((p) => p.contactId) : [],
          salesTaxStatus: status,
          gstNumber,
          qstNumber,
          filingFrequency: frequency,
          fiscalYearEnd: legalForm === "societe" ? yearEnd : "12-31",
          startedAt: startedAt || null,
          notes,
          ...company,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as ProfileView & {
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
      toast.success("Profil enregistré.");
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
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            Profil d&apos;entreprise · {organisation.name}
          </DialogTitle>
          <DialogDescription>
            Tout ce que ton comptable (et Revenu Québec) va te demander, au même
            endroit. Seules la forme juridique et les taxes changent les
            calculs; le reste est ta fiche.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-6"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          {!personal && (
          <Section title="Identification">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="tp-legal">Nom légal (au Registraire des entreprises)</Label>
                <Input
                  id="tp-legal"
                  {...field("legalName")}
                  placeholder={`${organisation.name} SENC`}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tp-neq">NEQ</Label>
                <Input
                  id="tp-neq"
                  inputMode="numeric"
                  {...field("neq")}
                  placeholder="1234567890"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tp-rq">No d&apos;identification Revenu Québec</Label>
                <Input
                  id="tp-rq"
                  {...field("rqNumber")}
                  placeholder="1234567890"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tp-start">Immatriculation au REQ</Label>
                <Input
                  id="tp-start"
                  type="date"
                  value={startedAt}
                  onChange={(e) => setStartedAt(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tp-naics">Code d&apos;activité (SCIAN)</Label>
                <Input
                  id="tp-naics"
                  inputMode="numeric"
                  {...field("naicsCode")}
                  placeholder="711190"
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="tp-activity">Activité</Label>
                <Input
                  id="tp-activity"
                  {...field("activity")}
                  placeholder="Événements extérieurs: billetterie, boutique en ligne, commandites"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tp-rs">Dossier employeur (RS)</Label>
                <Input
                  id="tp-rs"
                  {...field("payrollNumber")}
                  placeholder="1234567890RS0001"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tp-bn">NE fédéral (ARC)</Label>
                <Input
                  id="tp-bn"
                  inputMode="numeric"
                  {...field("businessNumber")}
                  placeholder="123456789"
                />
              </div>
              <p className="text-[12px] text-muted-foreground sm:col-span-2">
                Le NEQ et l&apos;immatriculation viennent du Registraire des entreprises; le no
                d&apos;identification et le dossier employeur (seulement si tu as des employés), de Mon
                dossier pour les entreprises. Le NE fédéral sert à l&apos;ARC, et ton no TPS en découle.
              </p>
            </div>
          </Section>
          )}

          <Section title="Forme juridique">
            <Choice
              options={LEGAL_FORMS}
              value={legalForm}
              onChange={setLegalForm}
            />
            <p className="text-[12px] text-muted-foreground">
              Pas de « inc. » ? Seul, c&apos;est une entreprise individuelle; à
              plusieurs sous un même nom (contrat de société, REQ), c&apos;est
              une SENC.
            </p>

            {legalForm === "societe" && (
              <div className="space-y-2">
                <Label>Fin d&apos;exercice</Label>
                <div className="flex gap-2">
                  <Input
                    aria-label="Jour"
                    inputMode="numeric"
                    value={dd}
                    onChange={(e) =>
                      setYearEnd(
                        `${mm}-${e.target.value.replace(/\D/g, "").slice(0, 2).padStart(2, "0")}`
                      )
                    }
                    className="w-20"
                  />
                  <select
                    aria-label="Mois"
                    value={mm}
                    onChange={(e) => setYearEnd(`${e.target.value}-${dd}`)}
                    className="h-10 flex-1 rounded-xl border border-input bg-background px-3 text-[14px]"
                  >
                    {Array.from({ length: 12 }, (_, i) =>
                      String(i + 1).padStart(2, "0")
                    ).map((m) => (
                      <option key={m} value={m}>
                        {new Intl.DateTimeFormat("fr-CA", {
                          month: "long",
                          timeZone: "UTC",
                        }).format(new Date(Date.UTC(2026, Number(m) - 1, 1)))}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {legalForm === "senc" && (
              <div className="space-y-2">
                <Label>Associés et parts</Label>
                <ul className="space-y-2">
                  {partners.map((p, i) => (
                    <li
                      key={i}
                      className="flex flex-wrap items-center gap-2 sm:flex-nowrap"
                    >
                      <div className="min-w-0 flex-1 basis-full sm:basis-0">
                        <ContactPicker
                          contacts={contacts}
                          value={p.contactId || null}
                          fallbackLabel={p.name || undefined}
                          onChange={(c) =>
                            setPartners((prev) =>
                              prev.map((x, j) =>
                                j === i
                                  ? {
                                      ...x,
                                      contactId: c.id,
                                      // Keep an existing name: it keys the movements and « Payé par ».
                                      name:
                                        x.name.trim() || c.name.split(/\s+/)[0],
                                    }
                                  : x
                              )
                            )
                          }
                        />
                      </div>
                      <Input
                        aria-label="Nom dans les comptes"
                        title="Nom utilisé dans les mouvements, « Payé par » et l'Excel"
                        value={p.name}
                        onChange={(e) =>
                          setPartners((prev) =>
                            prev.map((x, j) =>
                              j === i ? { ...x, name: e.target.value } : x
                            )
                          )
                        }
                        placeholder="Prénom"
                        className="w-28 flex-1 sm:flex-none"
                      />
                      <div className="flex w-24 items-center gap-1">
                        <Input
                          aria-label="Part"
                          inputMode="decimal"
                          value={p.share}
                          onChange={(e) =>
                            setPartners((prev) =>
                              prev.map((x, j) =>
                                j === i ? { ...x, share: e.target.value } : x
                              )
                            )
                          }
                          placeholder="50"
                          className="text-right tabular-nums"
                        />
                        <span className="text-[13px] text-muted-foreground">
                          %
                        </span>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Retirer"
                        onClick={() =>
                          setPartners((prev) => prev.filter((_, j) => j !== i))
                        }
                      >
                        <X />
                      </Button>
                    </li>
                  ))}
                </ul>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    setPartners((prev) => [
                      ...prev,
                      { name: "", share: "", contactId: "" },
                    ])
                  }
                >
                  <Plus /> Associé
                </Button>
                <p className="text-[12px] text-muted-foreground">
                  Choisis chaque associé dans tes contacts; le prénom à droite
                  est celui des mouvements et de l&apos;Excel. Les parts
                  répartissent le bénéfice (RL-15); vides = parts égales.
                </p>
              </div>
            )}
          </Section>

          {!personal && (
          <Section title="TVQ / TPS">
            <Choice
              options={SALES_TAX_STATUSES}
              value={status}
              onChange={setStatus}
            />
            <p className="text-[12px] text-muted-foreground">
              Obligatoire dès que tes ventes taxables dépassent 30 000 $ sur
              quatre trimestres. Au Québec, Revenu Québec gère les deux taxes:
              une seule inscription, une seule déclaration. En dessous du seuil,
              t&apos;inscrire quand même te laisse récupérer les taxes sur tes achats.
            </p>
            {status === "inscrit" && (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="tp-qst">No TVQ</Label>
                    <Input
                      id="tp-qst"
                      value={qstNumber}
                      onChange={(e) => setQst(e.target.value)}
                      placeholder="1234567890TQ0001"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="tp-gst">No TPS</Label>
                    <Input
                      id="tp-gst"
                      value={gstNumber}
                      onChange={(e) => setGst(e.target.value)}
                      placeholder="123456789RT0001"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Fréquence des déclarations</Label>
                  <Choice
                    options={FILING_FREQUENCIES}
                    value={frequency}
                    onChange={setFrequency}
                  />
                  <p className="text-[12px] text-muted-foreground">
                    Sur ton avis d&apos;inscription (Mon dossier, Revenu
                    Québec). Moins de 1,5 M$ de ventes: annuelle par défaut.
                  </p>
                </div>
              </>
            )}
          </Section>
          )}

          {!personal && (
          <Section
            title="Coordonnées"
            hint="L'adresse du siège, telle qu'au Registraire des entreprises."
          >
            <div className="grid gap-4 sm:grid-cols-6">
              <div className="space-y-2 sm:col-span-6">
                <Label htmlFor="tp-address">Adresse</Label>
                <Input
                  id="tp-address"
                  {...field("address")}
                  placeholder="123, rue Saint-Joseph Est"
                />
              </div>
              <div className="space-y-2 sm:col-span-3">
                <Label htmlFor="tp-city">Ville</Label>
                <Input id="tp-city" {...field("city")} placeholder="Québec" />
              </div>
              <div className="space-y-2 sm:col-span-1">
                <Label htmlFor="tp-prov">Prov.</Label>
                <Input id="tp-prov" {...field("province")} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="tp-postal">Code postal</Label>
                <Input
                  id="tp-postal"
                  {...field("postalCode")}
                  placeholder="G1K 3A1"
                />
              </div>
              <div className="space-y-2 sm:col-span-3">
                <Label htmlFor="tp-email">Courriel</Label>
                <Input id="tp-email" type="email" {...field("email")} />
              </div>
              <div className="space-y-2 sm:col-span-3">
                <Label htmlFor="tp-phone">Téléphone</Label>
                <Input id="tp-phone" type="tel" {...field("phone")} />
              </div>
              <div className="space-y-2 sm:col-span-6">
                <Label htmlFor="tp-web">Site web</Label>
                <Input
                  id="tp-web"
                  {...field("website")}
                  placeholder="dehorsqc.com"
                />
              </div>
            </div>
          </Section>
          )}

          {!personal && (
          <Section title="Comptable et banque">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="tp-acc">Comptable</Label>
                <Input
                  id="tp-acc"
                  {...field("accountant")}
                  placeholder="Nom ou cabinet"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tp-acc-email">Courriel du comptable</Label>
                <Input
                  id="tp-acc-email"
                  type="email"
                  {...field("accountantEmail")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tp-acc-phone">Téléphone du comptable</Label>
                <Input
                  id="tp-acc-phone"
                  type="tel"
                  {...field("accountantPhone")}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="tp-bank">Banque</Label>
                <Input
                  id="tp-bank"
                  {...field("bank")}
                  placeholder="Desjardins, compte d'entreprise"
                />
              </div>
            </div>
          </Section>
          )}

          <Section title="Notes">
            <Textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Contrat de société, particularités, choses à rappeler au comptable…"
            />
          </Section>

          {warnings.length > 0 && (
            <ul className="space-y-1.5">
              {warnings.map((w) => (
                <li
                  key={w}
                  className="rounded-xl bg-pending px-3 py-2 text-[13px] text-pending-foreground"
                >
                  {w}
                </li>
              ))}
            </ul>
          )}

          <div className="sticky bottom-0 -mx-6 -mb-6 flex justify-end border-t border-border bg-card px-6 py-4 md:-mx-8 md:-mb-8 md:px-8">
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
