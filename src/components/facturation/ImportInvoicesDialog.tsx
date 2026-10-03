"use client";

import { useEffect, useState } from "react";

import { FileText, Loader2, Sparkles, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

import { useT } from "@/i18n/client";
import type { InvoiceGuess } from "@/lib/fiscalite/extract";

import type { FactContact, FactOrg, IssuedView } from "./types";
import { centsToMoneyInput, moneyInputToCents, todayIso } from "./types";

interface Props {
  files: File[];
  organisation: FactOrg;
  contacts: FactContact[];
  onClose: () => void;
  onImported: (rows: IssuedView[]) => void;
}

interface Row {
  file: File;
  state: "reading" | "ready" | "failed";
  source?: string;
  party: string;
  contactId: string | null;
  number: string;
  date: string;
  dueDate: string;
  subtotal: string;
  gst: string;
  qst: string;
  total: string;
  paid: boolean;
  skip: boolean;
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/**
 * Invoices made elsewhere (before DreamDash, another tool): each PDF is read
 * by the Fiscalité extractor, then the rows are reviewed and added to the list.
 */
export function ImportInvoicesDialog({ files, organisation, contacts, onClose, onImported }: Props) {
  const t = useT();
  const [rows, setRows] = useState<Row[]>(() =>
    files.map((file) => ({
      file,
      state: "reading",
      party: "",
      contactId: null,
      number: "",
      date: todayIso(),
      dueDate: "",
      subtotal: "",
      gst: "",
      qst: "",
      total: "",
      paid: true,
      skip: false,
    }))
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    files.forEach(async (file, i) => {
      const form = new FormData();
      form.append("file", file);
      form.append("organisationId", organisation.id);
      try {
        const res = await fetch("/api/fiscalite/extract", { method: "POST", body: form });
        if (!res.ok) throw new Error();
        const { guess, source } = (await res.json()) as { guess: InvoiceGuess; source: string };
        const contact = guess.party
          ? contacts.find((c) => norm(c.name) === norm(guess.party!) || (c.company && norm(c.company) === norm(guess.party!)))
          : undefined;
        if (cancelled) return;
        setRows((prev) =>
          prev.map((r, j) =>
            j === i
              ? {
                  ...r,
                  state: "ready",
                  source,
                  party: contact ? (contact.company && contact.type === "person" ? contact.company : contact.name) : (guess.party ?? ""),
                  contactId: contact?.id ?? null,
                  number: guess.number ?? "",
                  date: guess.date ?? r.date,
                  subtotal: guess.subtotalCents != null ? centsToMoneyInput(guess.subtotalCents) : "",
                  gst: guess.gstCents != null ? centsToMoneyInput(guess.gstCents) : "",
                  qst: guess.qstCents != null ? centsToMoneyInput(guess.qstCents) : "",
                  total: guess.totalCents != null ? centsToMoneyInput(guess.totalCents) : "",
                }
              : r
          )
        );
      } catch {
        if (!cancelled) setRows((prev) => prev.map((r, j) => (j === i ? { ...r, state: "failed" } : r)));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [files, organisation.id, contacts]);

  const set = (i: number, patch: Partial<Row>) => setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const kept = rows.filter((r) => !r.skip);
  const reading = rows.some((r) => r.state === "reading");

  const save = async () => {
    const invalid = kept.find((r) => !r.party.trim() || moneyInputToCents(r.total) == null);
    if (invalid) {
      toast.error(t("facturation.import.missing", { file: invalid.file.name }));
      return;
    }
    setSaving(true);
    const done: IssuedView[] = [];
    for (const r of kept) {
      const total = moneyInputToCents(r.total) ?? 0;
      const gst = moneyInputToCents(r.gst) ?? 0;
      const qst = moneyInputToCents(r.qst) ?? 0;
      const form = new FormData();
      form.append(
        "data",
        JSON.stringify({
          organisationId: organisation.id,
          contactId: r.contactId,
          party: r.party.trim(),
          number: r.number.trim() || null,
          date: r.date,
          dueDate: r.dueDate || null,
          subtotalCents: moneyInputToCents(r.subtotal) ?? total - gst - qst,
          gstCents: gst,
          qstCents: qst,
          totalCents: total,
          status: r.paid ? "paid" : "sent",
        })
      );
      form.append("file", r.file);
      const res = await fetch("/api/facturation/invoices", { method: "POST", body: form });
      if (res.ok) done.push(await res.json());
      else toast.error(t("facturation.import.failed", { file: r.file.name }));
    }
    setSaving(false);
    if (done.length) {
      toast.success(t("facturation.import.done", { count: done.length }));
      onImported(done);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("facturation.import.title", { count: files.length })}</DialogTitle>
          <DialogDescription>{t("facturation.import.hint")}</DialogDescription>
        </DialogHeader>

        <ul className="space-y-3">
          {rows.map((r, i) => (
            <li key={i} className={`rounded-2xl bg-secondary/60 p-4 ${r.skip ? "opacity-50" : ""}`}>
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{r.file.name}</span>
                {r.state === "reading" && (
                  <span className="flex items-center gap-1 text-[12px] text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("facturation.import.reading")}
                  </span>
                )}
                {r.state === "ready" && r.source && r.source !== "none" && (
                  <span className="flex items-center gap-1 text-[12px] text-muted-foreground">
                    <Sparkles className="h-3.5 w-3.5" /> {t("facturation.import.extracted")}
                  </span>
                )}
                {r.state === "failed" && <span className="text-[12px] text-pending-foreground">{t("facturation.import.unread")}</span>}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 rounded-full"
                  onClick={() => set(i, { skip: !r.skip })}
                  aria-label={r.skip ? t("facturation.import.keep") : t("facturation.import.skip")}
                  title={r.skip ? t("facturation.import.keep") : t("facturation.import.skip")}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              {!r.skip && (
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="col-span-2 space-y-1">
                    <Label className="text-[12px]">{t("facturation.composer.party")}</Label>
                    <Input
                      value={r.party}
                      onChange={(e) => {
                        const c = contacts.find((x) => norm(x.name) === norm(e.target.value));
                        set(i, { party: e.target.value, contactId: c?.id ?? null });
                      }}
                      list="fact-import-contacts"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[12px]">{t("facturation.composer.number")}</Label>
                    <Input value={r.number} onChange={(e) => set(i, { number: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[12px]">{t("facturation.composer.date")}</Label>
                    <Input type="date" value={r.date} onChange={(e) => set(i, { date: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[12px]">{t("facturation.composer.subtotal")}</Label>
                    <Input inputMode="decimal" value={r.subtotal} onChange={(e) => set(i, { subtotal: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[12px]">{t("facturation.taxes.gst")}</Label>
                    <Input inputMode="decimal" value={r.gst} onChange={(e) => set(i, { gst: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[12px]">{t("facturation.taxes.qst")}</Label>
                    <Input inputMode="decimal" value={r.qst} onChange={(e) => set(i, { qst: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[12px]">{t("facturation.import.total")}</Label>
                    <Input inputMode="decimal" value={r.total} onChange={(e) => set(i, { total: e.target.value })} />
                  </div>
                  <label className="col-span-2 flex items-center gap-3 text-[13px] sm:col-span-4">
                    <Switch checked={r.paid} onCheckedChange={(v) => set(i, { paid: v })} />
                    {r.paid ? t("facturation.import.paid") : t("facturation.import.unpaid")}
                  </label>
                </div>
              )}
            </li>
          ))}
        </ul>
        <datalist id="fact-import-contacts">
          {contacts.map((c) => (
            <option key={c.id} value={c.name} />
          ))}
        </datalist>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            {t("common.cancel")}
          </Button>
          <Button onClick={save} disabled={saving || reading || kept.length === 0}>
            {saving && <Loader2 className="animate-spin" />}
            {t("facturation.import.submit", { count: kept.length })}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
