"use client";

import { useEffect, useRef, useState } from "react";

import { useRouter } from "next/navigation";

import { Download, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { useT } from "@/i18n";
import { formatDay, formatMoney, tCategoryLabel } from "@/lib/fiscalite/meta";

interface ImportSummary {
  fileOrganisation: string | null;
  fileYear: number | null;
  nameMismatch: boolean;
  invoices: {
    create: number;
    update: number;
    same: number;
    preview: {
      action: "create" | "update";
      direction: string;
      date: string;
      party: string | null;
      category: string | null;
      totalCents: number;
    }[];
  };
  movements: { create: number; same: number };
  newPartners: string[];
  skipped: { sheet: string; row: number; reason: string }[];
  otherAccounts?: string[];
  applied: boolean;
  error?: string;
}

/** A spreadsheet the import understands: our .xlsx, or a bank .csv. */
export const isSpreadsheet = (f: File) =>
  /\.(xlsx|csv)$/i.test(f.name) ||
  f.type === "text/csv" ||
  f.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export const SPREADSHEET_ACCEPT =
  ".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * Export the year to the bookkeeping workbook, or import one back: a dry run
 * first, shown for confirmation, then the merge.
 */
export function ExcelActions({ organisation, year }: { organisation: { id: string; name: string }; year: number }) {
  const t = useT();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);

  return (
    <>
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" asChild>
          <a href={`/api/fiscalite/export?organisationId=${organisation.id}&year=${year}`} download>
            <Download /> Excel
          </a>
        </Button>
        <Button size="sm" variant="secondary" onClick={() => input.current?.click()} disabled={!!file}>
          {file ? <Loader2 className="animate-spin" /> : <Upload />} {t("fiscalite.import.import")}
        </Button>
        <input
          ref={input}
          type="file"
          accept={SPREADSHEET_ACCEPT}
          className="hidden"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            e.target.value = "";
          }}
        />
      </div>
      <ImportDialog organisation={organisation} file={file} onClose={() => setFile(null)} />
    </>
  );
}

/**
 * The import of one spreadsheet: a dry run as soon as `file` is set, the plan
 * shown for confirmation, then the merge. `onClose` once done or dismissed.
 */
export function ImportDialog({
  organisation,
  file,
  onClose,
}: {
  organisation: { id: string; name: string };
  file: File | null;
  onClose: () => void;
}) {
  const t = useT();
  const router = useRouter();
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [busy, setBusy] = useState(false);

  const send = async (f: File, apply: boolean) => {
    const body = new FormData();
    body.append("file", f);
    body.append("organisationId", organisation.id);
    if (apply) body.append("apply", "1");
    const res = await fetch("/api/fiscalite/import", { method: "POST", body });
    const data = (await res.json().catch(() => ({}))) as ImportSummary;
    if (!res.ok) throw new Error(data.error || t("common.error", { status: res.status }));
    return data;
  };

  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    setSummary(null);
    setBusy(true);
    send(file, false)
      .then((s) => !cancelled && setSummary(s))
      .catch((e) => {
        if (cancelled) return;
        toast.error(t("toasts.fiscalite.importFileFailed", { name: file.name }), { description: e instanceof Error ? e.message : undefined });
        onClose();
      })
      .finally(() => !cancelled && setBusy(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per file
  }, [file]);

  const close = () => {
    setSummary(null);
    onClose();
  };

  const apply = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const s = await send(file, true);
      toast.success(
        t("toasts.fiscalite.imported", {
          created: t(s.invoices.create > 1 ? "fiscalite.import.newCount.other" : "fiscalite.import.newCount.one", {
            count: s.invoices.create,
          }),
          updated: t(s.invoices.update > 1 ? "fiscalite.import.updatedCount.other" : "fiscalite.import.updatedCount.one", {
            count: s.invoices.update,
          }),
        })
      );
      close();
      router.refresh();
    } catch (e) {
      toast.error(t("toasts.fiscalite.importFailed"), { description: e instanceof Error ? e.message : undefined });
    } finally {
      setBusy(false);
    }
  };

  const nothing =
    summary && summary.invoices.create + summary.invoices.update + summary.movements.create + summary.newPartners.length === 0;

  return (
    <Dialog open={!!summary} onOpenChange={(o) => !o && !busy && close()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("fiscalite.import.title", { name: organisation.name })}</DialogTitle>
          <DialogDescription>
            {file?.name}
            {summary?.fileYear ? ` · ${t("fiscalite.import.period", { year: summary.fileYear })}` : ""}.{" "}
            {t("fiscalite.import.description")}
          </DialogDescription>
        </DialogHeader>
        {summary && (
          <div className="space-y-4 text-[14px]">
            {summary.nameMismatch && (
              <p className="rounded-xl bg-pending px-3 py-2 text-[13px] text-pending-foreground">
                {t("fiscalite.import.nameMismatch", {
                  file: summary.fileOrganisation ?? "",
                  name: organisation.name,
                })}
              </p>
            )}
            <ul className="space-y-1">
              <li>
                <b className="tabular-nums">{summary.invoices.create}</b>{" "}
                {t(summary.invoices.create > 1 ? "fiscalite.import.newInvoices.other" : "fiscalite.import.newInvoices.one")}
              </li>
              <li>
                <b className="tabular-nums">{summary.invoices.update}</b>{" "}
                {t(summary.invoices.update > 1 ? "fiscalite.import.updates.other" : "fiscalite.import.updates.one")} ·{" "}
                <span className="text-muted-foreground">
                  {t(summary.invoices.same > 1 ? "fiscalite.import.same.other" : "fiscalite.import.same.one", {
                    count: summary.invoices.same,
                  })}
                </span>
              </li>
              <li>
                <b className="tabular-nums">{summary.movements.create}</b>{" "}
                {t(summary.movements.create > 1 ? "fiscalite.import.movements.other" : "fiscalite.import.movements.one")}
              </li>
              {summary.newPartners.length > 0 && <li>{t("fiscalite.import.newPartners", { names: summary.newPartners.join(", ") })}</li>}
            </ul>
            {summary.invoices.preview.length > 0 && (
              <ul className="max-h-[45vh] divide-y divide-border overflow-y-auto rounded-2xl bg-secondary/60 px-4 text-[13px]">
                {summary.invoices.preview.map((p, i) => (
                  <li key={i} className="flex items-center gap-3 py-2">
                    <span className="w-10 shrink-0 text-muted-foreground">{p.action === "create" ? t("fiscalite.import.actionCreate") : t("fiscalite.import.actionUpdate")}</span>
                    <span className="w-16 shrink-0 tabular-nums text-muted-foreground">
                      {formatDay(new Date(`${p.date}T00:00:00Z`), { short: true })}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{p.party ?? "—"}</span>
                      {p.category && (
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {tCategoryLabel(t, p.direction, p.category)}
                        </span>
                      )}
                    </span>
                    <span className={p.direction === "revenu" ? "tabular-nums text-positive-foreground" : "tabular-nums"}>
                      {p.direction === "revenu" ? "+" : "−"}
                      {formatMoney(p.totalCents)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {!!summary.otherAccounts?.length && (
              <p className="text-[12px] text-muted-foreground">
                {t("fiscalite.import.otherAccounts", { names: summary.otherAccounts.join(", ") })}
              </p>
            )}
            {summary.skipped.length > 0 && (
              <div className="text-[12px] text-muted-foreground">
                {t("fiscalite.import.skipped")}{" "}
                {summary.skipped
                  .slice(0, 6)
                  .map((s) => t("fiscalite.import.skippedRow", { sheet: s.sheet, row: s.row, reason: s.reason }))
                  .join(", ")}
                {summary.skipped.length > 6 ? "…" : ""}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={close} disabled={busy}>
                {t("common.cancel")}
              </Button>
              <Button onClick={apply} disabled={busy || !!nothing}>
                {busy && <Loader2 className="animate-spin" />}
                {nothing ? t("fiscalite.import.nothingNew") : t("fiscalite.import.import")}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
