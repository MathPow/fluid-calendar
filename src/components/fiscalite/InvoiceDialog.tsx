"use client";

import { useEffect, useMemo, useState } from "react";

import { ArrowDownLeft, ArrowUpRight, Calculator, FileText, Loader2, Sparkles, Trash2 } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import { useLocale, useT } from "@/i18n";
import { cn } from "@/lib/utils";

import type { InvoiceGuess } from "@/lib/fiscalite/extract";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_HINT_KEYS,
  GST_RATE,
  INCOME_CATEGORIES,
  PAID_BY_ME,
  PERSONAL_EXPENSE_CATEGORIES,
  PERSONAL_INCOME_CATEGORIES,
  QST_RATE,
  type TaxProfileLite,
  categoryOf,
  centsToInput,
  formatMoney,
  invoiceIssues,
  isPersonal,
  parseMoney,
  tCategoryLabel,
  taxesFor,
} from "@/lib/fiscalite/meta";
import type { InvoiceView } from "@/lib/fiscalite/queries";

interface InvoiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organisation: { id: string; name: string };
  profile: TaxProfileLite;
  /** Editing an existing invoice… */
  invoice?: InvoiceView | null;
  /** …or a freshly dropped file. */
  file?: File | null;
  onSaved: (invoice: InvoiceView) => void;
  onDeleted: (id: string) => void;
}

const NONE = "__none__";
const today = () => new Date().toLocaleDateString("en-CA");

interface Form {
  direction: "depense" | "revenu";
  date: string;
  party: string;
  partyTaxNumber: string;
  number: string;
  description: string;
  category: string;
  subtotal: string;
  gst: string;
  qst: string;
  total: string;
  notes: string;
  paidBy: string;
}

function emptyForm(): Form {
  return {
    direction: "depense",
    date: today(),
    party: "",
    partyTaxNumber: "",
    number: "",
    description: "",
    category: "",
    subtotal: "",
    gst: "",
    qst: "",
    total: "",
    notes: "",
    paidBy: "",
  };
}

function fromInvoice(inv: InvoiceView): Form {
  return {
    direction: inv.direction === "revenu" ? "revenu" : "depense",
    date: inv.date,
    party: inv.party ?? "",
    partyTaxNumber: inv.partyTaxNumber ?? "",
    number: inv.number ?? "",
    description: inv.description ?? "",
    category: inv.category ?? "",
    subtotal: centsToInput(inv.subtotalCents),
    gst: centsToInput(inv.gstCents),
    qst: centsToInput(inv.qstCents),
    total: centsToInput(inv.totalCents),
    notes: inv.notes ?? "",
    paidBy: inv.paidBy ?? "",
  };
}

/**
 * Add or edit one invoice. When opened with a dropped file, the file is read
 * server-side first and the guesses fill the fields that are still empty.
 */
export function InvoiceDialog({
  open,
  onOpenChange,
  organisation,
  profile,
  invoice,
  file,
  onSaved,
  onDeleted,
}: InvoiceDialogProps) {
  const t = useT();
  const moneyLocale = useLocale() === "en" ? "en-CA" : "fr-CA";
  const editing = !!invoice;
  const [form, setForm] = useState<Form>(emptyForm);
  const [reading, setReading] = useState(false);
  const [readNote, setReadNote] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    if (!open) return;
    setForm(invoice ? fromInvoice(invoice) : emptyForm());
    setReadNote(null);
  }, [open, invoice]);

  // A local preview of the dropped file.
  useEffect(() => {
    if (!open || !file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [open, file]);

  // Read the dropped file.
  useEffect(() => {
    if (!open || !file || invoice) return;
    let cancelled = false;
    setReading(true);
    const body = new FormData();
    body.append("file", file);
    body.append("organisationId", organisation.id);
    fetch("/api/fiscalite/extract", { method: "POST", body })
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as {
          guess?: InvoiceGuess;
          source?: string;
          error?: string;
        };
        if (!res.ok) throw new Error(data.error || t("common.error", { status: res.status }));
        if (cancelled) return;
        const g = data.guess ?? {};
        const money = (c?: number) => (c == null ? "" : centsToInput(c));
        setForm((f) => ({
          ...f,
          direction: g.direction ?? f.direction,
          date: g.date ?? f.date,
          party: f.party || g.party || "",
          partyTaxNumber: f.partyTaxNumber || g.partyTaxNumber || "",
          number: f.number || g.number || "",
          description: f.description || g.description || "",
          subtotal: f.subtotal || money(g.subtotalCents),
          gst: f.gst || money(g.gstCents),
          qst: f.qst || money(g.qstCents),
          total: f.total || money(g.totalCents),
        }));
        setReadNote(
          data.source === "none"
            ? t("fiscalite.invoiceDialog.read.noText")
            : data.source === "llm"
              ? t("fiscalite.invoiceDialog.read.llm")
              : t("fiscalite.invoiceDialog.read.auto")
        );
      })
      .catch((e) => {
        if (!cancelled) setReadNote(
            t("fiscalite.invoiceDialog.read.failed", {
              error: e instanceof Error ? e.message : t("fiscalite.invoiceDialog.read.errorFallback"),
            })
          );
      })
      .finally(() => {
        if (!cancelled) setReading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, file, invoice, organisation.id]);

  const cents = {
    subtotal: parseMoney(form.subtotal) ?? 0,
    gst: parseMoney(form.gst) ?? 0,
    qst: parseMoney(form.qst) ?? 0,
    total: parseMoney(form.total) ?? 0,
  };

  const fromSubtotal = () => {
    const t = taxesFor(cents.subtotal);
    setForm((f) => ({ ...f, gst: centsToInput(t.gst), qst: centsToInput(t.qst), total: centsToInput(t.total) }));
  };
  const fromTotal = () => {
    const sub = Math.round(cents.total / (1 + GST_RATE + QST_RATE));
    const t = taxesFor(sub);
    // Keep the typed total; rounding lands on the subtotal.
    setForm((f) => ({
      ...f,
      subtotal: centsToInput(cents.total - t.gst - t.qst),
      gst: centsToInput(t.gst),
      qst: centsToInput(t.qst),
    }));
  };

  // Budget perso: personal categories, one amount, no tax fields.
  const personal = isPersonal(profile);
  const partners = profile.legalForm === "senc" ? (profile.partners ?? []) : [];
  const standard: { id: string; label: string; line?: string }[] = personal
    ? form.direction === "revenu"
      ? PERSONAL_INCOME_CATEGORIES
      : PERSONAL_EXPENSE_CATEGORIES
    : form.direction === "revenu"
      ? INCOME_CATEGORIES
      : EXPENSE_CATEGORIES;
  // Accounts from an imported spreadsheet stay selectable as they are.
  const categories =
    form.category && !standard.some((c) => c.id === form.category)
      ? [...standard, { id: form.category, label: form.category }]
      : standard;
  const category = form.direction === "depense" && !personal ? categoryOf(form.category) : undefined;

  const issues = useMemo(
    () =>
      invoiceIssues(
        {
          id: "",
          direction: form.direction,
          date: form.date,
          party: form.party || null,
          partyTaxNumber: form.partyTaxNumber || null,
          number: form.number || null,
          category: form.category || null,
          subtotalCents: cents.subtotal,
          gstCents: cents.gst,
          qstCents: cents.qst,
          totalCents: cents.total || cents.subtotal + cents.gst + cents.qst,
          hasFile: !!file || !!invoice?.file,
        },
        profile
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [form, file, invoice, profile]
  );

  const submit = async () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date)) {
      toast.error(t("toasts.fiscalite.invalidDate"));
      return;
    }
    const payload = {
      organisationId: organisation.id,
      direction: form.direction,
      date: form.date,
      party: form.party,
      partyTaxNumber: form.direction === "depense" && !personal ? form.partyTaxNumber : null,
      number: form.number,
      description: form.description,
      category: form.category || null,
      ...(personal
        ? (() => {
            const total = cents.total || cents.subtotal + cents.gst + cents.qst;
            return { subtotalCents: total, gstCents: 0, qstCents: 0, totalCents: total };
          })()
        : {
            subtotalCents: cents.subtotal,
            gstCents: cents.gst,
            qstCents: cents.qst,
            totalCents: cents.total || cents.subtotal + cents.gst + cents.qst,
          }),
      notes: form.notes,
      paidBy: form.direction === "depense" && form.paidBy ? form.paidBy : null,
    };
    setSubmitting(true);
    try {
      let res: Response;
      if (editing) {
        res = await fetch(`/api/fiscalite/invoices/${invoice!.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        const body = new FormData();
        body.append("data", JSON.stringify(payload));
        if (file) body.append("file", file);
        res = await fetch("/api/fiscalite/invoices", { method: "POST", body });
      }
      const data = (await res.json().catch(() => ({}))) as InvoiceView & { error?: string };
      if (!res.ok) throw new Error(data.error || t("common.error", { status: res.status }));
      toast.success(editing ? t("toasts.fiscalite.invoiceUpdated") : t("toasts.fiscalite.invoiceFiled"));
      onSaved(data);
      onOpenChange(false);
    } catch (e) {
      toast.error(t("toasts.common.saveFailed"), {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async () => {
    if (!invoice || !window.confirm(t("fiscalite.invoiceDialog.confirmDelete"))) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/fiscalite/invoices/${invoice.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(t("common.error", { status: res.status }));
      toast.success(t("toasts.fiscalite.invoiceDeleted"));
      onDeleted(invoice.id);
      onOpenChange(false);
    } catch (e) {
      toast.error(t("toasts.fiscalite.deleteFailed"), {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const fileHref = invoice?.file ? `/api/fiscalite/invoices/${invoice.id}/file` : preview;
  const fileName = invoice?.file?.name ?? file?.name;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {personal
              ? editing
                ? t("fiscalite.invoiceDialog.title.editTransaction")
                : t("fiscalite.invoiceDialog.title.newTransaction")
              : editing
                ? t("fiscalite.invoiceDialog.title.editInvoice")
                : t("fiscalite.invoiceDialog.title.newInvoice")}
          </DialogTitle>
          <DialogDescription>{t("fiscalite.invoiceDialog.subtitle", { name: organisation.name })}</DialogDescription>
        </DialogHeader>

        {fileName && (
          <div className="flex items-center gap-3 rounded-2xl bg-secondary px-4 py-3">
            <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-medium">{fileName}</p>
              {(reading || readNote) && (
                <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                  {reading ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" /> {t("fiscalite.invoiceDialog.reading")}
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-3 w-3" /> {readNote}
                    </>
                  )}
                </p>
              )}
            </div>
            {fileHref && (
              <a
                href={fileHref}
                target="_blank"
                rel="noreferrer"
                className="text-[13px] font-medium underline underline-offset-4"
              >
                {t("fiscalite.invoiceDialog.open")}
              </a>
            )}
          </div>
        )}

        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                {
                  id: "depense",
                  label: t("fiscalite.invoiceDialog.direction.expense"),
                  hint: personal
                    ? t("fiscalite.invoiceDialog.direction.expense.hint.personal")
                    : t("fiscalite.invoiceDialog.direction.expense.hint"),
                  icon: ArrowUpRight,
                },
                {
                  id: "revenu",
                  label: t("fiscalite.invoiceDialog.direction.income"),
                  hint: personal
                    ? t("fiscalite.invoiceDialog.direction.income.hint.personal")
                    : t("fiscalite.invoiceDialog.direction.income.hint"),
                  icon: ArrowDownLeft,
                },
              ] as const
            ).map((d) => {
              const active = form.direction === d.id;
              return (
                <button
                  key={d.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setForm((f) => ({ ...f, direction: d.id, category: "" }))}
                  className={cn(
                    "flex items-start gap-3 rounded-2xl border-2 px-4 py-3 text-left transition-colors",
                    active ? "border-foreground bg-tint-soft" : "border-transparent bg-secondary hover:bg-border/70"
                  )}
                >
                  <d.icon className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    <span className="block text-[14px] font-semibold tracking-title">{d.label}</span>
                    <span className="block text-[12px] text-muted-foreground">{d.hint}</span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="inv-party">
                {personal
                  ? form.direction === "revenu"
                    ? t("fiscalite.invoiceDialog.party.source")
                    : t("fiscalite.invoiceDialog.party.store")
                  : form.direction === "revenu"
                    ? t("fiscalite.invoiceDialog.party.client")
                    : t("fiscalite.invoiceDialog.party.supplier")}
              </Label>
              <Input id="inv-party" value={form.party} onChange={(e) => set("party", e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="inv-date">{t("fiscalite.invoiceDialog.date")}</Label>
                <Input id="inv-date" type="date" value={form.date} onChange={(e) => set("date", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="inv-number">{personal ? t("fiscalite.invoiceDialog.number.receipt") : t("fiscalite.invoiceDialog.number.invoice")}</Label>
                <Input id="inv-number" value={form.number} onChange={(e) => set("number", e.target.value)} />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t("fiscalite.invoiceDialog.category")}</Label>
            <Select value={form.category || NONE} onValueChange={(v) => set("category", v === NONE ? "" : v)}>
              <SelectTrigger>
                <SelectValue placeholder={t("fiscalite.invoiceDialog.category.placeholder")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{t("fiscalite.category.none")}</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {tCategoryLabel(t, form.direction, c.id)}
                    {c.line ? ` ${t("fiscalite.invoiceDialog.category.line", { line: c.line })}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {category?.hint && (
              <p className="text-[12px] text-muted-foreground">
                {EXPENSE_CATEGORY_HINT_KEYS[category.id] ? t(EXPENSE_CATEGORY_HINT_KEYS[category.id]) : category.hint}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="inv-desc">{t("fiscalite.invoiceDialog.descriptionLabel")}</Label>
            <Input
              id="inv-desc"
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder={
                personal
                  ? form.direction === "revenu"
                    ? t("fiscalite.invoiceDialog.placeholder.personalIncome")
                    : t("fiscalite.invoiceDialog.placeholder.personalExpense")
                  : form.direction === "revenu"
                    ? t("fiscalite.invoiceDialog.placeholder.income")
                    : t("fiscalite.invoiceDialog.placeholder.expense")
              }
            />
          </div>

          {personal ? (
            <div className="space-y-1.5">
              <Label htmlFor="inv-total">{t("fiscalite.invoiceDialog.amount")}</Label>
              <Input
                id="inv-total"
                inputMode="decimal"
                value={form.total}
                onChange={(e) => set("total", e.target.value)}
                placeholder="0.00"
                className="text-[17px] font-semibold tabular-nums"
              />
            </div>
          ) : (
          <div className="space-y-3 rounded-2xl bg-secondary/60 p-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {(
                [
                  ["subtotal", t("fiscalite.invoiceDialog.subtotal")],
                  ["gst", t("fiscalite.invoiceDialog.gst")],
                  ["qst", t("fiscalite.invoiceDialog.qst")],
                  ["total", t("fiscalite.invoiceDialog.total")],
                ] as const
              ).map(([k, label]) => (
                <div key={k} className="space-y-1.5">
                  <Label htmlFor={`inv-${k}`} className="text-[12px]">
                    {label}
                  </Label>
                  <Input
                    id={`inv-${k}`}
                    inputMode="decimal"
                    value={form[k]}
                    onChange={(e) => set(k, e.target.value)}
                    placeholder="0.00"
                    className="tabular-nums"
                  />
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={fromSubtotal} disabled={!cents.subtotal}>
                <Calculator /> {t("fiscalite.invoiceDialog.taxesFromSubtotal")}
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={fromTotal} disabled={!cents.total}>
                <Calculator /> {t("fiscalite.invoiceDialog.taxesFromTotal")}
              </Button>
            </div>
          </div>
          )}

          {form.direction === "depense" && !personal && (
            <div className="space-y-2">
              <Label>{t("fiscalite.invoiceDialog.paidBy")}</Label>
              <div className="flex flex-wrap gap-2">
                {(partners.length > 0
                  ? [{ id: "", label: t("fiscalite.invoiceDialog.paidBy.senc") }, ...partners.map((p) => ({ id: p, label: p }))]
                  : [
                      { id: "", label: t("fiscalite.invoiceDialog.paidBy.business") },
                      { id: PAID_BY_ME, label: t("fiscalite.invoiceDialog.paidBy.me") },
                    ]
                ).map(
                  (o) => (
                    <button
                      key={o.id || "_senc"}
                      type="button"
                      aria-pressed={form.paidBy === o.id}
                      onClick={() => set("paidBy", o.id)}
                      className={cn(
                        "rounded-full border-2 px-4 py-1.5 text-[13px] font-medium transition-colors",
                        form.paidBy === o.id
                          ? "border-foreground bg-tint-soft"
                          : "border-transparent bg-secondary hover:bg-border/70"
                      )}
                    >
                      {o.label}
                    </button>
                  )
                )}
              </div>
              {form.paidBy && partners.length > 0 && (
                <p className="text-[12px] text-muted-foreground">
                  {t("fiscalite.invoiceDialog.paidBy.partnerNote", { name: form.paidBy })}
                </p>
              )}
              {form.paidBy === PAID_BY_ME && partners.length === 0 && (
                <p className="text-[12px] text-muted-foreground">
                  {profile.legalForm === "societe"
                    ? t("fiscalite.invoiceDialog.paidBy.meNote.societe")
                    : t("fiscalite.invoiceDialog.paidBy.meNote.individuelle")}
                </p>
              )}
            </div>
          )}

          {form.direction === "depense" && !personal && (
            <div className="space-y-2">
              <Label htmlFor="inv-taxno">{t("fiscalite.invoiceDialog.supplierTaxNumbers")}</Label>
              <Input
                id="inv-taxno"
                value={form.partyTaxNumber}
                onChange={(e) => set("partyTaxNumber", e.target.value)}
                placeholder="123456789RT0001 · 1234567890TQ0001"
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="inv-notes">{t("fiscalite.invoiceDialog.notes")}</Label>
            <Textarea
              id="inv-notes"
              rows={2}
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder={
                personal
                  ? t("fiscalite.invoiceDialog.notes.placeholder.personal")
                  : category?.id === "repas"
                    ? t("fiscalite.invoiceDialog.notes.placeholder.meals")
                    : t("fiscalite.invoiceDialog.notes.placeholder.default")
              }
            />
          </div>

          {issues.length > 0 && (
            <ul className="space-y-1.5">
              {issues.map((i) => (
                <li
                  key={i.text}
                  className={cn(
                    "rounded-xl px-3 py-2 text-[13px]",
                    i.level === "warn" ? "bg-pending text-pending-foreground" : "bg-secondary text-muted-foreground"
                  )}
                >
                  {i.key ? t(i.key, i.params) : i.text}
                </li>
              ))}
            </ul>
          )}

          <div className="flex items-center justify-between gap-3 pt-2">
            {editing ? (
              <Button type="button" variant="ghost" onClick={remove} disabled={submitting}>
                <Trash2 /> {t("common.delete")}
              </Button>
            ) : (
              <span className="text-[13px] tabular-nums text-muted-foreground">
                {formatMoney(cents.total || cents.subtotal + cents.gst + cents.qst, { locale: moneyLocale })}
              </span>
            )}
            <Button type="submit" size="lg" disabled={submitting || reading}>
              {submitting && <Loader2 className="animate-spin" />}
              {editing ? t("common.save") : personal ? t("common.add") : t("fiscalite.invoiceDialog.submit")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
