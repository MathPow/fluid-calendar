"use client";

import { useState } from "react";

import { Loader2, Paperclip, Send } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import { useT } from "@/i18n/client";
import { DEFAULT_EMAIL, fillTemplate, formatCents, formatIsoDay } from "@/lib/facturation/meta";

import type { FactOrg, FactSettings, IssuedView, MailAccountLite } from "./types";

interface Props {
  invoice: IssuedView;
  organisation: FactOrg;
  settings: FactSettings;
  accounts: MailAccountLite[];
  onClose: () => void;
  onSent: (inv: IssuedView) => void;
}

export function SendInvoiceDialog({ invoice, organisation, settings, accounts, onClose, onSent }: Props) {
  const t = useT();
  const values = {
    number: invoice.number ?? "",
    client: invoice.party ?? "",
    total: formatCents(invoice.totalCents, invoice.lang),
    date: formatIsoDay(invoice.date, invoice.lang),
    dueDate: invoice.dueDate ? formatIsoDay(invoice.dueDate, invoice.lang) : "",
    company: organisation.legalName || organisation.name,
  };
  const fallback = DEFAULT_EMAIL[invoice.lang];

  const [accountId, setAccountId] = useState(
    settings.mailAccountId && accounts.some((a) => a.id === settings.mailAccountId) ? settings.mailAccountId : (accounts[0]?.id ?? "")
  );
  const [to, setTo] = useState(invoice.clientEmail ?? "");
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState(fillTemplate(settings.emailSubject || fallback.subject, values));
  const [body, setBody] = useState(fillTemplate(settings.emailBody || fallback.body, values));
  const [sending, setSending] = useState(false);

  const send = async () => {
    if (!accountId || !to.trim()) {
      toast.error(t("facturation.send.missing"));
      return;
    }
    setSending(true);
    try {
      const res = await fetch(`/api/facturation/invoices/${invoice.id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mailAccountId: accountId, to: to.trim(), cc: cc.trim() || null, subject, body }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error);
      toast.success(t("facturation.toasts.sent", { email: to.trim() }));
      onSent(json);
    } catch (error) {
      toast.error(t("facturation.toasts.sendFailed"), {
        description: error instanceof Error && error.message ? error.message : undefined,
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("facturation.send.title", { number: invoice.number ?? "" })}</DialogTitle>
          <DialogDescription>
            {invoice.party} · {formatCents(invoice.totalCents, invoice.lang)}
          </DialogDescription>
        </DialogHeader>

        {accounts.length === 0 ? (
          <div className="space-y-3">
            <p className="text-[14px] text-muted-foreground">{t("facturation.send.noAccount")}</p>
            <Button asChild variant="secondary">
              <a href="/email">{t("facturation.send.connect")}</a>
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("facturation.send.from")}</Label>
              <Select value={accountId} onValueChange={setAccountId}>
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
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="send-to">{t("facturation.send.to")}</Label>
                <Input id="send-to" type="email" inputMode="email" value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="send-cc">{t("facturation.send.cc")}</Label>
                <Input id="send-cc" value={cc} onChange={(e) => setCc(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="send-subject">{t("facturation.send.subject")}</Label>
              <Input id="send-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="send-body">{t("facturation.send.body")}</Label>
              <Textarea id="send-body" rows={7} value={body} onChange={(e) => setBody(e.target.value)} />
            </div>
            <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
              <Paperclip className="h-3.5 w-3.5" /> {t("facturation.send.attached")}
            </p>
          </div>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onClose} disabled={sending}>
            {invoice.sentAt || accounts.length === 0 ? t("common.close") : t("facturation.send.later")}
          </Button>
          {accounts.length > 0 && (
            <Button onClick={send} disabled={sending}>
              {sending ? <Loader2 className="animate-spin" /> : <Send />} {t("facturation.send.submit")}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
