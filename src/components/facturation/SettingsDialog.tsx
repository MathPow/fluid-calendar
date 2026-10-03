"use client";

import { useState } from "react";

import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import { useT } from "@/i18n/client";
import { DEFAULT_EMAIL, type InvoiceLang } from "@/lib/facturation/meta";

import type { FactOrg, FactSettings, MailAccountLite } from "./types";

interface Props {
  organisation: FactOrg;
  settings: FactSettings;
  accounts: MailAccountLite[];
  onClose: () => void;
  onSaved: (s: FactSettings) => void;
}

const NONE = "__none__";

export function SettingsDialog({ organisation, settings, accounts, onClose, onSaved }: Props) {
  const t = useT();
  const [prefix, setPrefix] = useState(settings.numberPrefix ?? "");
  const [dueDays, setDueDays] = useState(String(settings.dueDays));
  const [lang, setLang] = useState<InvoiceLang>(settings.lang);
  const [notes, setNotes] = useState(settings.notes ?? "");
  const [mailAccountId, setMailAccountId] = useState(settings.mailAccountId ?? NONE);
  const [subject, setSubject] = useState(settings.emailSubject ?? "");
  const [body, setBody] = useState(settings.emailBody ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/facturation/settings/${organisation.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          numberPrefix: prefix.trim() || null,
          dueDays: Math.max(0, Number(dueDays) || 0),
          lang,
          notes: notes.trim() || null,
          mailAccountId: mailAccountId === NONE ? null : mailAccountId,
          emailSubject: subject.trim() || null,
          emailBody: body.trim() || null,
        }),
      });
      if (!res.ok) throw new Error();
      const s = await res.json();
      onSaved({
        numberPrefix: s.numberPrefix,
        dueDays: s.dueDays,
        lang: s.lang === "en" ? "en" : "fr",
        notes: s.notes,
        mailAccountId: s.mailAccountId,
        emailSubject: s.emailSubject,
        emailBody: s.emailBody,
        nextNumber: s.nextNumber,
      });
      toast.success(t("facturation.toasts.settingsSaved"));
    } catch {
      toast.error(t("facturation.toasts.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("facturation.settings.title")}</DialogTitle>
          <DialogDescription>{t("facturation.settings.hint", { org: organisation.name })}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="fs-prefix">{t("facturation.settings.prefix")}</Label>
              <Input id="fs-prefix" value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder="F-2026-" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fs-due">{t("facturation.composer.dueDays")}</Label>
              <Input id="fs-due" type="number" min={0} max={365} value={dueDays} onChange={(e) => setDueDays(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{t("facturation.composer.lang")}</Label>
              <Select value={lang} onValueChange={(v) => setLang(v as InvoiceLang)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fr">{t("common.lang.fr")}</SelectItem>
                  <SelectItem value="en">{t("common.lang.en")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="-mt-2 text-[12px] text-muted-foreground">
            {t("facturation.settings.prefixHint", { number: settings.nextNumber })}
          </p>

          <div className="space-y-2">
            <Label htmlFor="fs-notes">{t("facturation.settings.notes")}</Label>
            <Textarea
              id="fs-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t("facturation.composer.notesPlaceholder")}
            />
          </div>

          <div className="space-y-2">
            <Label>{t("facturation.settings.account")}</Label>
            <Select value={mailAccountId} onValueChange={setMailAccountId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{t("facturation.settings.accountNone")}</SelectItem>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.displayName ? `${a.displayName} · ${a.email}` : a.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="fs-subject">{t("facturation.settings.subject")}</Label>
            <Input id="fs-subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={DEFAULT_EMAIL[lang].subject} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="fs-body">{t("facturation.settings.body")}</Label>
            <Textarea id="fs-body" rows={6} value={body} onChange={(e) => setBody(e.target.value)} placeholder={DEFAULT_EMAIL[lang].body} />
            <p className="text-[12px] text-muted-foreground">{t("facturation.settings.placeholders")}</p>
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            {t("common.cancel")}
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="animate-spin" />}
            {t("common.save")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
