"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { useT } from "@/i18n/client";
import {
  AlertTriangle,
  ArrowLeft,
  ChevronDown,
  FlaskConical,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Save,
  ShieldBan,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

import {
  type ImportIssue,
  type PreflightIssue,
  type PreflightWarning,
  TICK_MINUTES,
  parseCampaignCsv,
  renderBody,
} from "@/lib/envois/logic";
import { cn } from "@/lib/utils";

const DEFAULT_FOOTER =
  "DehorsQC, 1115 rue du Phénix, Lévis (Québec)\nPour ne plus recevoir de courriels de ma part, réponds simplement « non merci ».";

interface Stats {
  total: number;
  queued: number;
  sent: number;
  failed: number;
  replied: number;
  unsubscribed: number;
  bounced: number;
}

interface CampaignSummary {
  id: string;
  name: string;
  status: string;
  pauseReason: string | null;
  createdAt: string;
  account: { email: string } | null;
  stats: Stats;
}

interface Recipient {
  id: string;
  email: string;
  organisation: string | null;
  subject: string;
  body: string;
  reviewNote: string | null;
  selected: boolean;
  status: string;
  outcome: string | null;
  error: string | null;
  replySnippet: string | null;
  sentAt: string | null;
}

interface CampaignDetail {
  id: string;
  name: string;
  status: string;
  pauseReason: string | null;
  fromName: string | null;
  footer: string;
  dailyLimit: number;
  sendFromHour: number;
  sendUntilHour: number;
  weekdaysOnly: boolean;
  notBefore: string | null;
  testSentAt: string | null;
  account: { email: string } | null;
  recipients: Recipient[];
  preflight: { errors: PreflightIssue[]; warnings: PreflightWarning[] };
}

interface AccountLite {
  id: string;
  email: string;
  displayName: string | null;
}

interface Exclusion {
  id: string;
  email: string;
  reason: string;
}

type Filter = "all" | "flagged" | "waiting" | "sent" | "replies" | "problems";
const FILTERS: Filter[] = [
  "all",
  "flagged",
  "waiting",
  "sent",
  "replies",
  "problems",
];

async function api<T>(
  path: string,
  init?: { method?: string; body?: unknown }
): Promise<T> {
  const res = await fetch(path, {
    method: init?.method ?? "GET",
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

const matchesFilter = (r: Recipient, filter: Filter) => {
  switch (filter) {
    case "flagged":
      return Boolean(r.reviewNote);
    case "waiting":
      return (
        r.status === "pending" ||
        r.status === "queued" ||
        r.status === "sending"
      );
    case "sent":
      return r.status === "sent";
    case "replies":
      return r.outcome === "replied" || r.outcome === "unsubscribed";
    case "problems":
      return (
        r.status === "failed" ||
        r.status === "unknown" ||
        r.status === "skipped" ||
        r.outcome === "bounced"
      );
    default:
      return true;
  }
};

export function EnvoisBoard() {
  const t = useT();
  const router = useRouter();
  const params = useSearchParams();
  const openId = params.get("campagne");

  const [campaigns, setCampaigns] = useState<CampaignSummary[] | null>(null);
  const [accounts, setAccounts] = useState<AccountLite[]>([]);
  const [creating, setCreating] = useState(false);
  const [exclusionsOpen, setExclusionsOpen] = useState(false);

  const reload = useCallback(async () => {
    try {
      setCampaigns(await api<CampaignSummary[]>("/api/envois"));
    } catch {
      toast.error(t("envois.toasts.loadFailed"));
      setCampaigns([]);
    }
  }, [t]);

  useEffect(() => {
    void reload();
    void api<{ accounts?: AccountLite[] }>("/api/mail/accounts")
      .then((data) => setAccounts(data.accounts ?? []))
      .catch(() => undefined);
  }, [reload]);

  const open = (id: string | null) =>
    router.push(id ? `/envois?campagne=${id}` : "/envois");

  return (
    <div className="page pb-16 pt-8 md:pt-12">
      <header className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="segmented mb-5">
            <Link href="/email" className="segmented-item">
              {t("envois.tab.inbox")}
            </Link>
            <Link href="/envois" className="segmented-item" aria-current="page">
              {t("envois.tab.campaigns")}
            </Link>
          </div>
          <h1 className="display text-[44px] sm:text-[64px]">
            {t("envois.title")}
          </h1>
          <p className="mt-3 max-w-xl text-[15px] text-muted-foreground">
            {t("envois.subtitle")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setExclusionsOpen(true)}>
            <ShieldBan /> {t("envois.exclusions.open")}
          </Button>
          <Button onClick={() => setCreating(true)}>
            <Plus /> {t("envois.new.open")}
          </Button>
        </div>
      </header>

      {openId ? (
        <CampaignView
          // A fresh view per campaign, or the settings form keeps the last one's values.
          key={openId}
          id={openId}
          onBack={() => open(null)}
          onChanged={reload}
        />
      ) : (
        <CampaignList campaigns={campaigns} onOpen={open} />
      )}

      <NewCampaignDialog
        open={creating}
        accounts={accounts}
        onClose={() => setCreating(false)}
        onCreated={(id) => {
          setCreating(false);
          void reload();
          open(id);
        }}
      />
      <ExclusionsDialog
        open={exclusionsOpen}
        onClose={() => setExclusionsOpen(false)}
      />
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const t = useT();
  const tone =
    status === "sending"
      ? "default"
      : status === "paused"
        ? "destructive"
        : "secondary";
  return <Badge variant={tone}>{t(`envois.status.${status}`)}</Badge>;
}

function CampaignList({
  campaigns,
  onOpen,
}: {
  campaigns: CampaignSummary[] | null;
  onOpen: (id: string) => void;
}) {
  const t = useT();
  if (!campaigns)
    return (
      <p className="mt-10 text-[14px] text-muted-foreground">
        {t("envois.loading")}
      </p>
    );
  if (campaigns.length === 0) {
    return (
      <p className="mt-10 max-w-xl text-[15px] text-muted-foreground">
        {t("envois.empty")}
      </p>
    );
  }
  return (
    <ul className="mt-10 space-y-3">
      {campaigns.map((c) => {
        const done = c.stats.total
          ? Math.round((c.stats.sent / c.stats.total) * 100)
          : 0;
        return (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => onOpen(c.id)}
              className="w-full rounded-2xl border border-border bg-card p-5 text-left transition-colors hover:bg-secondary"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[16px] font-semibold">{c.name}</span>
                <StatusBadge status={c.status} />
              </div>
              <p className="mt-1 text-[13px] text-muted-foreground">
                {c.account?.email ?? t("envois.noAccount")}
              </p>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${done}%` }}
                />
              </div>
              <p className="mt-2 text-[13px] text-muted-foreground">
                {t("envois.stats.line", {
                  sent: c.stats.sent,
                  total: c.stats.total,
                  replied: c.stats.replied,
                  unsubscribed: c.stats.unsubscribed,
                  bounced: c.stats.bounced,
                })}
              </p>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function CampaignView({
  id,
  onBack,
  onChanged,
}: {
  id: string;
  onBack: () => void;
  onChanged: () => void;
}) {
  const t = useT();
  const [campaign, setCampaign] = useState<CampaignDetail | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [testTo, setTestTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setCampaign(await api<CampaignDetail>(`/api/envois/${id}`));
    } catch {
      toast.error(t("envois.toasts.loadFailed"));
    }
  }, [id, t]);

  useEffect(() => {
    void load();
  }, [load]);

  // A running campaign moves on its own: keep the counters honest.
  const running = campaign?.status === "sending";
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => void load(), 20_000);
    return () => clearInterval(timer);
  }, [running, load]);

  const act = async (body: Record<string, unknown>) => {
    setBusy(true);
    try {
      const result = await api<{
        campaign: CampaignDetail;
        test?: { to: string };
      }>(`/api/envois/${id}/action`, {
        method: "POST",
        body,
      });
      setCampaign(result.campaign);
      onChanged();
      return result;
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("envois.toasts.actionFailed")
      );
      return null;
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api(`/api/envois/${id}`, { method: "DELETE" });
      onChanged();
      onBack();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("envois.toasts.actionFailed")
      );
    } finally {
      setBusy(false);
    }
  };

  const shown = useMemo(
    () =>
      campaign
        ? campaign.recipients.filter((r) => matchesFilter(r, filter))
        : [],
    [campaign, filter]
  );

  if (!campaign)
    return (
      <p className="mt-10 text-[14px] text-muted-foreground">
        {t("envois.loading")}
      </p>
    );

  const going = campaign.recipients.filter(
    (r) => r.status === "queued" || (r.status === "pending" && r.selected)
  ).length;
  const flagged = campaign.recipients.filter(
    (r) => r.status === "pending" && r.reviewNote && !r.selected
  ).length;
  const hours = Math.floor((going * TICK_MINUTES) / 60);
  const minutes = (going * TICK_MINUTES) % 60;
  const sentCount = campaign.recipients.filter(
    (r) => r.status === "sent"
  ).length;
  const blocked = campaign.preflight.errors.length > 0;

  return (
    <div className="mt-8">
      <Button variant="ghost" size="sm" onClick={onBack}>
        <ArrowLeft /> {t("envois.back")}
      </Button>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h2 className="text-[24px] font-semibold">{campaign.name}</h2>
        <StatusBadge status={campaign.status} />
      </div>
      <p className="mt-1 text-[14px] text-muted-foreground">
        {campaign.account?.email ?? t("envois.noAccount")}
      </p>
      {campaign.notBefore && new Date(campaign.notBefore) > new Date() && (
        <p className="mt-1 text-[14px] font-medium">
          {t("envois.notBefore", {
            date: new Date(campaign.notBefore).toLocaleString(undefined, {
              weekday: "long",
              day: "numeric",
              month: "long",
              hour: "numeric",
              minute: "2-digit",
            }),
          })}
        </p>
      )}

      {campaign.status === "paused" && campaign.pauseReason && (
        <p className="mt-4 flex items-start gap-2 rounded-xl border border-destructive/40 p-3 text-[14px]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          {t(`envois.pause.${campaign.pauseReason}`)}
        </p>
      )}

      <section className="mt-6 rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center gap-2">
          {campaign.status !== "sending" && campaign.status !== "done" && (
            <Button
              disabled={busy || blocked}
              onClick={() => setConfirming(true)}
            >
              <Play />{" "}
              {campaign.status === "paused"
                ? t("envois.resume")
                : t("envois.start", { count: going })}
            </Button>
          )}
          {campaign.status === "sending" && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void act({ action: "pause" })}
            >
              <Pause /> {t("envois.pause.action")}
            </Button>
          )}
          {flagged > 0 &&
            campaign.status !== "sending" &&
            campaign.status !== "done" && (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() =>
                  void act({
                    action: "select",
                    selected: true,
                    onlyFlagged: true,
                  })
                }
              >
                {t("envois.includeFlagged", { count: flagged })}
              </Button>
            )}
          {sentCount === 0 && campaign.status !== "sending" && (
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => void remove()}
            >
              <Trash2 /> {t("envois.delete")}
            </Button>
          )}
        </div>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            value={testTo}
            onChange={(e) => setTestTo(e.target.value)}
            placeholder={campaign.account?.email ?? ""}
            aria-label={t("envois.test.to")}
            className="sm:max-w-xs"
          />
          <Button
            variant="outline"
            disabled={busy}
            onClick={async () => {
              const result = await act({
                action: "test",
                ...(testTo.trim() ? { to: testTo.trim() } : {}),
              });
              if (result?.test)
                toast.success(t("envois.test.sent", { to: result.test.to }));
            }}
          >
            <FlaskConical /> {t("envois.test.send")}
          </Button>
        </div>

        {(campaign.status === "draft" || campaign.status === "paused") && (
          <ul className="mt-4 space-y-1.5 text-[14px]">
            {campaign.preflight.errors.map((issue, i) => (
              <li
                key={`e${i}`}
                className="flex items-start gap-2 text-destructive"
              >
                <X className="mt-0.5 h-4 w-4 shrink-0" />
                {t(
                  `envois.preflight.${issue.code}`,
                  issue as unknown as Record<string, string | number>
                )}
              </li>
            ))}
            {campaign.preflight.warnings.map((issue, i) => (
              <li
                key={`w${i}`}
                className="flex items-start gap-2 text-muted-foreground"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                {t(
                  `envois.preflight.${issue.code}`,
                  issue as unknown as Record<string, string | number>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <CampaignSettings campaign={campaign} onSaved={setCampaign} />

      <div className="segmented mt-8 max-w-full overflow-x-auto">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            className="segmented-item"
            data-active={filter === f}
            onClick={() => setFilter(f)}
          >
            {t(`envois.filter.${f}`)} (
            {campaign.recipients.filter((r) => matchesFilter(r, f)).length})
          </button>
        ))}
      </div>

      <ul className="mt-4 divide-y divide-border rounded-2xl border border-border bg-card">
        {shown.map((r) => (
          <RecipientRow
            key={r.id}
            campaignId={id}
            recipient={r}
            footer={campaign.footer}
            expanded={expanded === r.id}
            onToggle={() => setExpanded(expanded === r.id ? null : r.id)}
            onChanged={setCampaign}
          />
        ))}
        {shown.length === 0 && (
          <li className="p-5 text-[14px] text-muted-foreground">
            {t("envois.filter.empty")}
          </li>
        )}
      </ul>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t("envois.confirm.title", { count: going })}
            </DialogTitle>
            <DialogDescription>
              {t("envois.confirm.body", {
                from: campaign.account?.email ?? "",
                hours,
                minutes,
                tick: TICK_MINUTES,
                start: campaign.sendFromHour,
                end: campaign.sendUntilHour,
              })}
            </DialogDescription>
          </DialogHeader>
          {campaign.preflight.warnings.length > 0 && (
            <ul className="space-y-1.5 text-[14px] text-muted-foreground">
              {campaign.preflight.warnings.map((issue, i) => (
                <li key={i} className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  {t(
                    `envois.preflight.${issue.code}`,
                    issue as unknown as Record<string, string | number>
                  )}
                </li>
              ))}
            </ul>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              {t("envois.cancel")}
            </Button>
            <Button
              disabled={busy}
              onClick={async () => {
                setConfirming(false);
                if (await act({ action: "start" }))
                  toast.success(t("envois.toasts.started"));
              }}
            >
              <Play /> {t("envois.confirm.go")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CampaignSettings({
  campaign,
  onSaved,
}: {
  campaign: CampaignDetail;
  onSaved: (c: CampaignDetail) => void;
}) {
  const t = useT();
  const [fromName, setFromName] = useState(campaign.fromName ?? "");
  const [footer, setFooter] = useState(campaign.footer);
  const [dailyLimit, setDailyLimit] = useState(String(campaign.dailyLimit));
  const [sendFromHour, setSendFromHour] = useState(
    String(campaign.sendFromHour)
  );
  const [sendUntilHour, setSendUntilHour] = useState(
    String(campaign.sendUntilHour)
  );
  const [weekdaysOnly, setWeekdaysOnly] = useState(campaign.weekdaysOnly);
  const [saving, setSaving] = useState(false);
  const locked = campaign.status === "sending";

  const save = async () => {
    setSaving(true);
    try {
      onSaved(
        await api<CampaignDetail>(`/api/envois/${campaign.id}`, {
          method: "PATCH",
          body: {
            fromName: fromName.trim() || null,
            footer,
            dailyLimit: Number(dailyLimit),
            sendFromHour: Number(sendFromHour),
            sendUntilHour: Number(sendUntilHour),
            weekdaysOnly,
          },
        })
      );
      toast.success(t("envois.toasts.saved"));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("envois.toasts.actionFailed")
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mt-4 rounded-2xl border border-border bg-card p-5">
      <h3 className="text-[15px] font-semibold">
        {t("envois.settings.title")}
      </h3>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="envoi-from">{t("envois.settings.fromName")}</Label>
          <Input
            id="envoi-from"
            value={fromName}
            disabled={locked}
            onChange={(e) => setFromName(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="envoi-limit">
              {t("envois.settings.dailyLimit")}
            </Label>
            <Input
              id="envoi-limit"
              type="number"
              min={1}
              max={500}
              value={dailyLimit}
              disabled={locked}
              onChange={(e) => setDailyLimit(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="envoi-start">
              {t("envois.settings.startHour")}
            </Label>
            <Input
              id="envoi-start"
              type="number"
              min={0}
              max={23}
              value={sendFromHour}
              disabled={locked}
              onChange={(e) => setSendFromHour(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="envoi-end">{t("envois.settings.endHour")}</Label>
            <Input
              id="envoi-end"
              type="number"
              min={1}
              max={24}
              value={sendUntilHour}
              disabled={locked}
              onChange={(e) => setSendUntilHour(e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor="envoi-footer">{t("envois.settings.footer")}</Label>
          <Textarea
            id="envoi-footer"
            rows={3}
            value={footer}
            disabled={locked}
            onChange={(e) => setFooter(e.target.value)}
          />
          <p className="text-[13px] text-muted-foreground">
            {t("envois.settings.footerHint")}
          </p>
        </div>
        <label className="flex items-center gap-3 text-[14px]">
          <Switch
            checked={weekdaysOnly}
            disabled={locked}
            onCheckedChange={setWeekdaysOnly}
          />
          {t("envois.settings.weekdaysOnly")}
        </label>
      </div>
      <Button
        className="mt-4"
        variant="outline"
        disabled={locked || saving}
        onClick={() => void save()}
      >
        <Save /> {t("envois.settings.save")}
      </Button>
    </section>
  );
}

function RecipientRow({
  campaignId,
  recipient,
  footer,
  expanded,
  onToggle,
  onChanged,
}: {
  campaignId: string;
  recipient: Recipient;
  footer: string;
  expanded: boolean;
  onToggle: () => void;
  onChanged: (c: CampaignDetail) => void;
}) {
  const t = useT();
  const [email, setEmail] = useState(recipient.email);
  const [subject, setSubject] = useState(recipient.subject);
  const [body, setBody] = useState(recipient.body);
  const [busy, setBusy] = useState(false);
  const editable =
    recipient.status !== "sent" && recipient.status !== "sending";
  const tickable = recipient.status === "pending";

  const patch = async (data: Record<string, unknown>) => {
    setBusy(true);
    try {
      onChanged(
        await api<CampaignDetail>(
          `/api/envois/${campaignId}/recipients/${recipient.id}`,
          {
            method: "PATCH",
            body: data,
          }
        )
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("envois.toasts.actionFailed")
      );
    } finally {
      setBusy(false);
    }
  };

  const edited =
    email !== recipient.email ||
    subject !== recipient.subject ||
    body !== recipient.body;

  return (
    <li className="p-4">
      <div className="flex items-start gap-3">
        <Checkbox
          className="mt-1"
          checked={
            recipient.status === "queued" ||
            recipient.status === "sent" ||
            recipient.selected
          }
          disabled={!tickable || busy}
          aria-label={t("envois.recipient.include", { email: recipient.email })}
          onCheckedChange={(value) => void patch({ selected: value === true })}
        />
        <button
          type="button"
          onClick={onToggle}
          className="min-w-0 flex-1 text-left"
          aria-expanded={expanded}
        >
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-[14px] font-semibold">
              {recipient.organisation ?? recipient.email}
            </span>
            <Badge variant="secondary">
              {t(`envois.recipient.status.${recipient.status}`)}
            </Badge>
            {recipient.outcome && (
              <Badge
                variant={
                  recipient.outcome === "replied" ? "default" : "destructive"
                }
              >
                {t(`envois.recipient.outcome.${recipient.outcome}`)}
              </Badge>
            )}
          </span>
          <span className="mt-0.5 block truncate text-[13px] text-muted-foreground">
            {recipient.email} · {recipient.subject}
          </span>
          {recipient.reviewNote && (
            <span className="mt-1 flex items-start gap-1.5 text-[13px] text-muted-foreground">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {recipient.reviewNote}
            </span>
          )}
        </button>
        <ChevronDown
          className={cn(
            "mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            expanded && "rotate-180"
          )}
        />
      </div>

      {expanded && (
        <div className="mt-4 space-y-3 md:pl-8">
          {recipient.error && (
            <p className="text-[13px] text-destructive">{recipient.error}</p>
          )}
          {recipient.replySnippet && (
            <blockquote className="border-l-2 border-border pl-3 text-[14px] text-muted-foreground">
              {recipient.replySnippet}
            </blockquote>
          )}
          {editable ? (
            <>
              <div className="space-y-1.5">
                <Label>{t("envois.recipient.email")}</Label>
                <Input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("envois.recipient.subject")}</Label>
                <Input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("envois.recipient.body")}</Label>
                <Textarea
                  rows={12}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                />
              </div>
              {footer.trim() && (
                <p className="whitespace-pre-wrap text-[13px] text-muted-foreground">
                  {footer.trim()}
                </p>
              )}
            </>
          ) : (
            <pre className="whitespace-pre-wrap font-sans text-[14px]">
              {renderBody(recipient.body, footer)}
            </pre>
          )}
          <div className="flex flex-wrap gap-2">
            {editable && (
              <Button
                variant="outline"
                size="sm"
                disabled={busy || !edited}
                onClick={() => void patch({ email, subject, body })}
              >
                <Save /> {t("envois.recipient.save")}
              </Button>
            )}
            {recipient.reviewNote && editable && (
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => void patch({ reviewed: true, selected: true })}
              >
                {t("envois.recipient.reviewed")}
              </Button>
            )}
            {(recipient.status === "failed" ||
              recipient.status === "unknown") && (
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => void patch({ requeue: true })}
              >
                <RotateCcw /> {t("envois.recipient.requeue")}
              </Button>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

function issueText(t: ReturnType<typeof useT>, issue: ImportIssue) {
  return t(
    `envois.import.${issue.code}`,
    issue as unknown as Record<string, string | number>
  );
}

function NewCampaignDialog({
  open,
  accounts,
  onClose,
  onCreated,
}: {
  open: boolean;
  accounts: AccountLite[];
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const t = useT();
  const [name, setName] = useState("");
  const [accountId, setAccountId] = useState("");
  const [fromName, setFromName] = useState("");
  const [footer, setFooter] = useState(DEFAULT_FOOTER);
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState("");
  const [saving, setSaving] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const parsed = useMemo(() => (csv ? parseCampaignCsv(csv) : null), [csv]);
  const account = accountId || accounts[0]?.id || "";

  const create = async () => {
    setSaving(true);
    try {
      const result = await api<{ id: string }>("/api/envois", {
        method: "POST",
        body: { name, accountId: account, fromName, footer, csv },
      });
      setName("");
      setCsv("");
      setFileName("");
      onCreated(result.id);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("envois.toasts.actionFailed")
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="max-h-[85dvh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("envois.new.title")}</DialogTitle>
          <DialogDescription>{t("envois.new.hint")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="new-name">{t("envois.new.name")}</Label>
            <Input
              id="new-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("envois.new.account")}</Label>
            <Select value={account} onValueChange={setAccountId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-from">{t("envois.settings.fromName")}</Label>
            <Input
              id="new-from"
              value={fromName}
              onChange={(e) => setFromName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-footer">{t("envois.settings.footer")}</Label>
            <Textarea
              id="new-footer"
              rows={3}
              value={footer}
              onChange={(e) => setFooter(e.target.value)}
            />
          </div>
          <div>
            <input
              ref={fileInput}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setFileName(file.name);
                setCsv(await file.text());
              }}
            />
            <Button
              variant="outline"
              onClick={() => fileInput.current?.click()}
            >
              <Upload /> {fileName || t("envois.new.file")}
            </Button>
            {parsed && (
              <div className="mt-3 text-[14px]">
                <p>
                  {t("envois.new.parsed", {
                    count: parsed.rows.length,
                    flagged: parsed.rows.filter((r) => r.reviewNote).length,
                  })}
                </p>
                {parsed.issues.length > 0 && (
                  <ul className="mt-1 list-disc pl-5 text-[13px] text-destructive">
                    {parsed.issues.slice(0, 8).map((issue, i) => (
                      <li key={i}>{issueText(t, issue)}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              {t("envois.cancel")}
            </Button>
            <Button
              disabled={
                saving || !name.trim() || !account || !parsed?.rows.length
              }
              onClick={() => void create()}
            >
              {t("envois.new.create")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ExclusionsDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const t = useT();
  const [list, setList] = useState<Exclusion[]>([]);
  const [email, setEmail] = useState("");

  useEffect(() => {
    if (!open) return;
    void api<Exclusion[]>("/api/envois/exclusions")
      .then(setList)
      .catch(() => undefined);
  }, [open]);

  const add = async () => {
    try {
      setList(
        await api<Exclusion[]>("/api/envois/exclusions", {
          method: "POST",
          body: { email: email.trim() },
        })
      );
      setEmail("");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("envois.toasts.actionFailed")
      );
    }
  };

  const remove = async (id: string) => {
    try {
      setList(
        await api<Exclusion[]>(
          `/api/envois/exclusions?id=${encodeURIComponent(id)}`,
          { method: "DELETE" }
        )
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("envois.toasts.actionFailed")
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("envois.exclusions.title")}</DialogTitle>
          <DialogDescription>{t("envois.exclusions.hint")}</DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <Input
            type="email"
            value={email}
            placeholder="nom@exemple.ca"
            aria-label={t("envois.recipient.email")}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Button
            variant="outline"
            disabled={!email.trim()}
            onClick={() => void add()}
          >
            <Plus /> {t("envois.exclusions.add")}
          </Button>
        </div>
        <ul className="divide-y divide-border">
          {list.map((row) => (
            <li
              key={row.id}
              className="flex items-center justify-between gap-3 py-2 text-[14px]"
            >
              <span className="min-w-0 truncate">{row.email}</span>
              <span className="flex shrink-0 items-center gap-2 text-[13px] text-muted-foreground">
                {t(`envois.exclusions.reason.${row.reason}`)}
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t("envois.exclusions.remove", {
                    email: row.email,
                  })}
                  onClick={() => void remove(row.id)}
                >
                  <X />
                </Button>
              </span>
            </li>
          ))}
          {list.length === 0 && (
            <li className="py-2 text-[14px] text-muted-foreground">
              {t("envois.exclusions.empty")}
            </li>
          )}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
