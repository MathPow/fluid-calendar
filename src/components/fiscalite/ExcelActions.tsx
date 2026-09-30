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

import { categoryLabel, formatDay, formatMoney } from "@/lib/fiscalite/meta";

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
          {file ? <Loader2 className="animate-spin" /> : <Upload />} Importer
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
    if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
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
        toast.error(`Import impossible: ${file.name}`, { description: e instanceof Error ? e.message : undefined });
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
        `Importé: ${s.invoices.create} nouvelle${s.invoices.create > 1 ? "s" : ""}, ${s.invoices.update} mise${s.invoices.update > 1 ? "s" : ""} à jour.`
      );
      close();
      router.refresh();
    } catch (e) {
      toast.error("Import impossible", { description: e instanceof Error ? e.message : undefined });
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
          <DialogTitle>Importer dans {organisation.name}</DialogTitle>
          <DialogDescription>
            {file?.name}
            {summary?.fileYear ? ` · période ${summary.fileYear}` : ""}. Rien n&apos;est supprimé: les
            lignes sont ajoutées ou mettent à jour les factures déjà classées.
          </DialogDescription>
        </DialogHeader>
        {summary && (
          <div className="space-y-4 text-[14px]">
            {summary.nameMismatch && (
              <p className="rounded-xl bg-pending px-3 py-2 text-[13px] text-pending-foreground">
                Le classeur est au nom de « {summary.fileOrganisation} », pas {organisation.name}.
              </p>
            )}
            <ul className="space-y-1">
              <li>
                <b className="tabular-nums">{summary.invoices.create}</b> nouvelle{summary.invoices.create > 1 ? "s" : ""} facture
                {summary.invoices.create > 1 ? "s" : ""}
              </li>
              <li>
                <b className="tabular-nums">{summary.invoices.update}</b> mise{summary.invoices.update > 1 ? "s" : ""} à jour ·{" "}
                <span className="text-muted-foreground">{summary.invoices.same} identique{summary.invoices.same > 1 ? "s" : ""}</span>
              </li>
              <li>
                <b className="tabular-nums">{summary.movements.create}</b> mouvement{summary.movements.create > 1 ? "s" : ""} d&apos;associé
              </li>
              {summary.newPartners.length > 0 && <li>Nouveaux associés: {summary.newPartners.join(", ")}</li>}
            </ul>
            {summary.invoices.preview.length > 0 && (
              <ul className="max-h-[45vh] divide-y divide-border overflow-y-auto rounded-2xl bg-secondary/60 px-4 text-[13px]">
                {summary.invoices.preview.map((p, i) => (
                  <li key={i} className="flex items-center gap-3 py-2">
                    <span className="w-10 shrink-0 text-muted-foreground">{p.action === "create" ? "Ajout" : "Màj"}</span>
                    <span className="w-16 shrink-0 tabular-nums text-muted-foreground">
                      {formatDay(new Date(`${p.date}T00:00:00Z`), { short: true })}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{p.party ?? "—"}</span>
                      {p.category && (
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {categoryLabel(p.direction, p.category)}
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
                Comptes laissés de côté: {summary.otherAccounts.join(", ")}
              </p>
            )}
            {summary.skipped.length > 0 && (
              <div className="text-[12px] text-muted-foreground">
                Lignes ignorées:{" "}
                {summary.skipped
                  .slice(0, 6)
                  .map((s) => `${s.sheet} l.${s.row} (${s.reason})`)
                  .join(", ")}
                {summary.skipped.length > 6 ? "…" : ""}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={close} disabled={busy}>
                Annuler
              </Button>
              <Button onClick={apply} disabled={busy || !!nothing}>
                {busy && <Loader2 className="animate-spin" />}
                {nothing ? "Rien de nouveau" : "Importer"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
