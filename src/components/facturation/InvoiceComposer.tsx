"use client";

import { useMemo, useState } from "react";

import { Eye, History, Loader2, Plus, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

import { useT } from "@/i18n/client";
import {
  FREQUENCIES,
  type Frequency,
  type InvoiceLang,
  type InvoiceLine,
  computeTotals,
  formatCents,
  formatIsoDay,
} from "@/lib/facturation/meta";

import type { FactContact, FactOrg, FactSettings, IssuedView, MailAccountLite, RecurringView } from "./types";
import { centsToMoneyInput, moneyInputToCents, openBlob, plusDaysIso, todayIso } from "./types";

export interface ComposerSeed {
  mode: "invoice" | "recurring";
  /** Edit this invoice… */
  invoice?: IssuedView;
  /** …or this contract… */
  recurring?: RecurringView;
  /** …or start from a copy of this invoice. */
  duplicateOf?: IssuedView;
}

interface Props {
  seed: ComposerSeed;
  organisation: FactOrg;
  settings: FactSettings;
  contacts: FactContact[];
  invoices: IssuedView[];
  accounts: MailAccountLite[];
  onClose: () => void;
  onSavedInvoice: (inv: IssuedView, thenSend: boolean) => void;
  onSavedRecurring: (r: RecurringView) => void;
}

interface LineDraft {
  description: string;
  quantity: string;
  unit: string;
}

const emptyLine = (): LineDraft => ({ description: "", quantity: "1", unit: "" });
const toDrafts = (lines: InvoiceLine[]): LineDraft[] =>
  lines.length
    ? lines.map((l) => ({ description: l.description, quantity: String(l.quantity), unit: centsToMoneyInput(l.unitCents) }))
    : [emptyLine()];

const same = (a: string | null | undefined, b: string | null | undefined) =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

export function InvoiceComposer({
  seed,
  organisation,
  settings,
  contacts,
  invoices,
  accounts,
  onClose,
  onSavedInvoice,
  onSavedRecurring,
}: Props) {
  const t = useT();
  const today = todayIso();
  const recurringMode = seed.mode === "recurring";
  const editingInvoice = seed.invoice ?? null;
  const editingRecurring = seed.recurring ?? null;
  const source = editingInvoice ?? editingRecurring ?? seed.duplicateOf ?? null;

  const [contactId, setContactId] = useState(source?.contactId ?? "");
  const [party, setParty] = useState(source?.party ?? "");
  const [clientEmail, setClientEmail] = useState(source?.clientEmail ?? "");
  const [billTo, setBillTo] = useState(source?.billTo ?? "");
  const [title, setTitle] = useState(
    editingRecurring?.title ?? (source && "description" in source ? (source.description ?? "") : "")
  );
  const [lines, setLines] = useState<LineDraft[]>(toDrafts(source?.lines ?? []));
  const [applyTaxes, setApplyTaxes] = useState(source?.applyTaxes ?? organisation.registered);
  const [lang, setLang] = useState<InvoiceLang>(source?.lang ?? settings.lang);
  const [notes, setNotes] = useState(source?.notes ?? settings.notes ?? "");

  const [number, setNumber] = useState(editingInvoice?.number ?? "");
  const [date, setDate] = useState(editingInvoice?.date ?? today);
  const [dueDate, setDueDate] = useState(editingInvoice?.dueDate ?? plusDaysIso(today, settings.dueDays));

  const [frequency, setFrequency] = useState<Frequency>(editingRecurring?.frequency ?? "monthly");
  const [intervalText, setIntervalText] = useState(String(editingRecurring?.interval ?? 1));
  const [nextRunDate, setNextRunDate] = useState(editingRecurring?.nextRunDate ?? today);
  const [endDate, setEndDate] = useState(editingRecurring?.endDate ?? "");
  const [dueDays, setDueDays] = useState(String(editingRecurring?.dueDays ?? settings.dueDays));
  const [autoSend, setAutoSend] = useState(editingRecurring?.autoSend ?? true);
  const [mailAccountId, setMailAccountId] = useState(
    editingRecurring?.mailAccountId ?? settings.mailAccountId ?? accounts[0]?.id ?? ""
  );
  const [cc, setCc] = useState(editingRecurring?.cc ?? "");

  const [saving, setSaving] = useState<"draft" | "send" | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [appliedMemory, setAppliedMemory] = useState<string | null>(null);

  const parsedLines: InvoiceLine[] = lines
    .map((l) => ({
      description: l.description.trim(),
      quantity: Number(l.quantity.replace(",", ".")) || 0,
      unitCents: moneyInputToCents(l.unit) ?? 0,
    }))
    .filter((l) => l.description || l.unitCents);
  const totals = computeTotals(parsedLines, applyTaxes);
  const money = (c: number) => formatCents(c, lang);

  // The client's last invoice made here: the "memory" offered when picking them.
  const lastForClient = useMemo(() => {
    if (editingInvoice || editingRecurring) return null;
    return (
      invoices.find((i) => i.generated && ((contactId && i.contactId === contactId) || same(i.party, party))) ?? null
    );
  }, [invoices, contactId, party, editingInvoice, editingRecurring]);

  const applyMemory = (inv: IssuedView) => {
    setLines(toDrafts(inv.lines));
    setBillTo(inv.billTo ?? "");
    if (inv.clientEmail) setClientEmail(inv.clientEmail);
    setApplyTaxes(inv.applyTaxes);
    setLang(inv.lang);
    if (inv.description) setTitle(inv.description);
    if (inv.notes) setNotes(inv.notes);
    setAppliedMemory(inv.id);
  };

  const pickContact = (id: string) => {
    const c = contacts.find((x) => x.id === id);
    if (!c) {
      // Typed a name that isn't a contact.
      setContactId("");
      setParty(id);
      return;
    }
    setContactId(c.id);
    setParty(c.type === "person" && c.company ? c.company : c.name);
    if (c.email) setClientEmail(c.email);
    const last = invoices.find((i) => i.generated && (i.contactId === c.id || same(i.party, c.name)));
    const untouched = parsedLines.length === 0;
    if (last && untouched && !editingInvoice && !editingRecurring) applyMemory(last);
  };

  const setLine = (i: number, patch: Partial<LineDraft>) =>
    setLines((prev) => prev.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const contentBody = () => ({
    organisationId: organisation.id,
    contactId: contactId || null,
    party: party.trim(),
    billTo: billTo.trim() || null,
    clientEmail: clientEmail.trim() || null,
    title: title.trim() || null,
    lines: parsedLines,
    applyTaxes,
    lang,
    notes: notes.trim() || null,
  });

  const invoiceBody = () => ({
    ...contentBody(),
    number: number.trim() || null,
    date: recurringMode ? nextRunDate : date,
    dueDate: recurringMode ? plusDaysIso(nextRunDate, Number(dueDays) || 0) : dueDate || null,
  });

  const validate = (): boolean => {
    if (!party.trim()) {
      toast.error(t("facturation.composer.errors.client"));
      return false;
    }
    if (parsedLines.length === 0) {
      toast.error(t("facturation.composer.errors.lines"));
      return false;
    }
    if (recurringMode && !title.trim()) {
      toast.error(t("facturation.composer.errors.title"));
      return false;
    }
    if (recurringMode && autoSend && (!clientEmail.trim() || !mailAccountId)) {
      toast.error(t("facturation.composer.errors.autoSend"));
      return false;
    }
    return true;
  };

  const preview = async () => {
    if (!validate()) return;
    setPreviewing(true);
    try {
      const res = await fetch("/api/facturation/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(invoiceBody()),
      });
      if (!res.ok) throw new Error();
      openBlob(await res.blob(), "apercu.pdf");
    } catch {
      toast.error(t("facturation.toasts.previewFailed"));
    } finally {
      setPreviewing(false);
    }
  };

  const save = async (thenSend: boolean) => {
    if (!validate()) return;
    setSaving(thenSend ? "send" : "draft");
    try {
      if (recurringMode) {
        const res = await fetch(editingRecurring ? `/api/facturation/recurring/${editingRecurring.id}` : "/api/facturation/recurring", {
          method: editingRecurring ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...contentBody(),
            title: title.trim(),
            cc: cc.trim() || null,
            frequency,
            interval: Math.max(1, Number(intervalText) || 1),
            dueDays: Math.max(0, Number(dueDays) || 0),
            nextRunDate,
            endDate: endDate || null,
            autoSend,
            mailAccountId: mailAccountId || null,
          }),
        });
        if (!res.ok) throw new Error();
        onSavedRecurring(await res.json());
        toast.success(t("facturation.toasts.recurringSaved"));
      } else {
        const res = await fetch(editingInvoice ? `/api/facturation/invoices/${editingInvoice.id}` : "/api/facturation/invoices", {
          method: editingInvoice ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(invoiceBody()),
        });
        if (!res.ok) throw new Error();
        onSavedInvoice(await res.json(), thenSend);
        if (!thenSend) toast.success(t("facturation.toasts.invoiceSaved"));
      }
    } catch {
      toast.error(t("facturation.toasts.saveFailed"));
    } finally {
      setSaving(null);
    }
  };

  const contactOptions = contacts.map((c) => ({
    value: c.id,
    label: c.company && c.type === "person" ? `${c.name} · ${c.company}` : c.name,
  }));

  const heading = recurringMode
    ? editingRecurring
      ? t("facturation.composer.editRecurring")
      : t("facturation.composer.newRecurring")
    : editingInvoice
      ? t("facturation.composer.editInvoice", { number: editingInvoice.number ?? "" })
      : t("facturation.composer.newInvoice");

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{heading}</DialogTitle>
          <DialogDescription>
            {recurringMode ? t("facturation.composer.recurringHint") : t("facturation.composer.invoiceHint", { org: organisation.name })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Client */}
          <section className="space-y-3">
            <p className="etiquette">{t("facturation.composer.client")}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{t("facturation.composer.contact")}</Label>
                <SearchableSelect
                  value={contactId || party}
                  onChange={pickContact}
                  options={contactOptions}
                  allowCustom
                  placeholder={t("facturation.composer.contactPlaceholder")}
                  emptyLabel={t("facturation.composer.contactEmpty")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fact-party">{t("facturation.composer.party")}</Label>
                <Input id="fact-party" value={party} onChange={(e) => setParty(e.target.value)} placeholder={t("facturation.composer.partyPlaceholder")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fact-email">{t("facturation.composer.email")}</Label>
                <Input
                  id="fact-email"
                  type="email"
                  inputMode="email"
                  value={clientEmail}
                  onChange={(e) => setClientEmail(e.target.value)}
                  placeholder="compta@client.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fact-billto">{t("facturation.composer.billTo")}</Label>
                <Textarea
                  id="fact-billto"
                  rows={2}
                  value={billTo}
                  onChange={(e) => setBillTo(e.target.value)}
                  placeholder={t("facturation.composer.billToPlaceholder")}
                />
              </div>
            </div>
            {lastForClient && appliedMemory !== lastForClient.id && (
              <button
                type="button"
                onClick={() => applyMemory(lastForClient)}
                className="flex w-full items-center gap-2 rounded-xl bg-tint-soft px-3 py-2 text-left text-[13px] hover:bg-secondary"
              >
                <History className="h-4 w-4 shrink-0" />
                {t("facturation.composer.memory", {
                  number: lastForClient.number ?? "",
                  date: formatIsoDay(lastForClient.date, lang),
                  total: formatCents(lastForClient.totalCents, lang),
                })}
              </button>
            )}
            {appliedMemory && (
              <p className="text-[12px] text-muted-foreground">{t("facturation.composer.memoryApplied")}</p>
            )}
          </section>

          {/* What */}
          <section className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="fact-title">
                {recurringMode ? t("facturation.composer.contract") : t("facturation.composer.subject")}
              </Label>
              <Input
                id="fact-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={recurringMode ? t("facturation.composer.contractPlaceholder") : t("facturation.composer.subjectPlaceholder")}
              />
            </div>

            <div className="space-y-2">
              <Label>{t("facturation.composer.lines")}</Label>
              <div className="space-y-2">
                {lines.map((l, i) => (
                  <div key={i} className="grid grid-cols-[1fr_auto] gap-2 rounded-2xl bg-secondary/60 p-2 sm:grid-cols-[minmax(0,1fr)_80px_120px_auto] sm:items-center sm:bg-transparent sm:p-0">
                    <Input
                      className="col-span-2 sm:col-span-1"
                      value={l.description}
                      onChange={(e) => setLine(i, { description: e.target.value })}
                      placeholder={t("facturation.composer.lineDescription")}
                      aria-label={t("facturation.composer.lineDescription")}
                    />
                    <div className="col-span-2 grid grid-cols-[80px_1fr_auto] gap-2 sm:contents">
                      <Input
                        inputMode="decimal"
                        value={l.quantity}
                        onChange={(e) => setLine(i, { quantity: e.target.value })}
                        aria-label={t("facturation.composer.lineQty")}
                        placeholder={t("facturation.composer.lineQty")}
                      />
                      <Input
                        inputMode="decimal"
                        value={l.unit}
                        onChange={(e) => setLine(i, { unit: e.target.value })}
                        aria-label={t("facturation.composer.lineUnit")}
                        placeholder={t("facturation.composer.lineUnitPlaceholder")}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-10 w-10 rounded-full"
                        disabled={lines.length === 1}
                        onClick={() => setLines((prev) => prev.filter((_, j) => j !== i))}
                        aria-label={t("facturation.composer.removeLine")}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              <Button type="button" variant="secondary" size="sm" onClick={() => setLines((prev) => [...prev, emptyLine()])}>
                <Plus /> {t("facturation.composer.addLine")}
              </Button>
            </div>

            <div className="flex flex-col gap-3 rounded-2xl bg-secondary px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <label className="flex items-center gap-3 text-[14px]">
                <Switch checked={applyTaxes} onCheckedChange={setApplyTaxes} />
                <span>
                  <span className="block font-medium">{t("facturation.composer.taxes")}</span>
                  {!organisation.registered && (
                    <span className="block text-[12px] text-muted-foreground">{t("facturation.composer.taxesNotRegistered")}</span>
                  )}
                </span>
              </label>
              <div className="text-right text-[13px] tabular-nums">
                <div className="text-muted-foreground">
                  {t("facturation.composer.subtotal")} {money(totals.subtotalCents)}
                  {applyTaxes && ` · TPS ${money(totals.gstCents)} · TVQ ${money(totals.qstCents)}`}
                </div>
                <div className="text-[18px] font-bold tracking-title">{money(totals.totalCents)}</div>
              </div>
            </div>
          </section>

          {/* When */}
          {recurringMode ? (
            <section className="space-y-3">
              <p className="etiquette">{t("facturation.composer.schedule")}</p>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label>{t("facturation.composer.frequency")}</Label>
                  <Select value={frequency} onValueChange={(v) => setFrequency(v as Frequency)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FREQUENCIES.map((f) => (
                        <SelectItem key={f} value={f}>
                          {t(`facturation.frequency.${f}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fact-interval">{t("facturation.composer.interval")}</Label>
                  <Input id="fact-interval" type="number" min={1} max={24} value={intervalText} onChange={(e) => setIntervalText(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fact-duedays">{t("facturation.composer.dueDays")}</Label>
                  <Input id="fact-duedays" type="number" min={0} max={365} value={dueDays} onChange={(e) => setDueDays(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fact-next">{editingRecurring ? t("facturation.composer.nextRun") : t("facturation.composer.firstRun")}</Label>
                  <Input id="fact-next" type="date" value={nextRunDate} onChange={(e) => setNextRunDate(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fact-end">{t("facturation.composer.endDate")}</Label>
                  <Input id="fact-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                </div>
              </div>
              <p className="text-[12px] text-muted-foreground">{t("facturation.composer.runHint")}</p>

              <label className="flex items-start justify-between gap-4 rounded-2xl bg-secondary px-4 py-3">
                <span>
                  <span className="block text-[14px] font-semibold tracking-title">{t("facturation.composer.autoSend")}</span>
                  <span className="block text-[12px] text-muted-foreground">{t("facturation.composer.autoSendHint")}</span>
                </span>
                <Switch checked={autoSend} onCheckedChange={setAutoSend} />
              </label>
              {autoSend && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>{t("facturation.send.from")}</Label>
                    {accounts.length ? (
                      <Select value={mailAccountId} onValueChange={setMailAccountId}>
                        <SelectTrigger>
                          <SelectValue placeholder={t("facturation.send.pickAccount")} />
                        </SelectTrigger>
                        <SelectContent>
                          {accounts.map((a) => (
                            <SelectItem key={a.id} value={a.id}>
                              {a.displayName ? `${a.displayName} · ${a.email}` : a.email}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <p className="text-[13px] text-muted-foreground">{t("facturation.send.noAccount")}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="fact-cc">{t("facturation.send.cc")}</Label>
                    <Input id="fact-cc" value={cc} onChange={(e) => setCc(e.target.value)} placeholder="cc@client.com" />
                  </div>
                </div>
              )}
            </section>
          ) : (
            <section className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="fact-number">{t("facturation.composer.number")}</Label>
                <Input id="fact-number" value={number} onChange={(e) => setNumber(e.target.value)} placeholder={settings.nextNumber} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fact-date">{t("facturation.composer.date")}</Label>
                <Input
                  id="fact-date"
                  type="date"
                  value={date}
                  onChange={(e) => {
                    setDate(e.target.value);
                    if (e.target.value) setDueDate(plusDaysIso(e.target.value, settings.dueDays));
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fact-due">{t("facturation.composer.dueDate")}</Label>
                <Input id="fact-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>
            </section>
          )}

          <section className="grid gap-3 sm:grid-cols-[1fr_160px]">
            <div className="space-y-2">
              <Label htmlFor="fact-notes">{t("facturation.composer.notes")}</Label>
              <Textarea
                id="fact-notes"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t("facturation.composer.notesPlaceholder")}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("facturation.composer.lang")}</Label>
              <Select value={lang} onValueChange={(v) => setLang(v as InvoiceLang)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fr">Français</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </section>
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
          <Button type="button" variant="ghost" onClick={preview} disabled={previewing || !!saving} className="sm:mr-auto">
            {previewing ? <Loader2 className="animate-spin" /> : <Eye />} {t("facturation.composer.preview")}
          </Button>
          <Button type="button" variant="outline" onClick={onClose} disabled={!!saving}>
            {t("common.cancel")}
          </Button>
          {recurringMode ? (
            <Button type="button" onClick={() => save(false)} disabled={!!saving}>
              {saving && <Loader2 className="animate-spin" />}
              {editingRecurring ? t("common.save") : t("facturation.composer.createRecurring")}
            </Button>
          ) : (
            <>
              <Button type="button" variant="secondary" onClick={() => save(false)} disabled={!!saving}>
                {saving === "draft" && <Loader2 className="animate-spin" />}
                {editingInvoice ? t("common.save") : t("facturation.composer.saveDraft")}
              </Button>
              <Button type="button" onClick={() => save(true)} disabled={!!saving}>
                {saving === "send" ? <Loader2 className="animate-spin" /> : <Send />} {t("facturation.composer.saveAndSend")}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
