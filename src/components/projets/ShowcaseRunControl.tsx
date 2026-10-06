"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useRouter } from "next/navigation";

import { AlertTriangle, Check, Clock, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { useLocale, useT } from "@/i18n/client";
import { timeAgo } from "@/lib/projets/meta";
import type { ShowcaseRunView } from "@/lib/projets/showcase-runs";
import { cn } from "@/lib/utils";

const POLL_MS = 10_000;

const isActive = (run: ShowcaseRunView | null) =>
  run?.status === "queued" || run?.status === "running";

/** "depuis 3 min" / "for 3 min" without the leading "il y a" / "ago". */
const since = (date: string, locale: "fr" | "en") => {
  const ago = timeAgo(date, locale);
  if (locale === "en") {
    return ago.endsWith(" ago") ? `for ${ago.slice(0, -4)}` : "just now";
  }
  return ago.startsWith("il y a ") ? `depuis ${ago.slice(7)}` : "à l'instant";
};

/**
 * Runs the /project-showcase skill on this project. DreamDash only queues the
 * run; the host runner picks it up within ~20 s and runs Claude Code headless
 * in the project's folder. Polls while the run is queued/running and refreshes
 * the page when it's done so the new store page shows up.
 */
export function ShowcaseRunControl({
  projectId,
  hasPath,
  hasShowcase,
  initialRun,
  layout = "bar",
}: {
  projectId: string;
  hasPath: boolean;
  hasShowcase: boolean;
  initialRun: ShowcaseRunView | null;
  /** "bar": a slim row above the store page. "empty": the empty-state tile. */
  layout?: "bar" | "empty";
}) {
  const router = useRouter();
  const t = useT();
  const [run, setRun] = useState(initialRun);
  const [busy, setBusy] = useState(false);
  const [, setTick] = useState(0);
  // Only refresh the page for a run we saw go from active to done.
  const watching = useRef(isActive(initialRun));

  const endpoint = `/api/projets/${projectId}/showcase-run`;

  const poll = useCallback(async () => {
    try {
      const res = await fetch(endpoint, { cache: "no-store" });
      if (!res.ok) return;
      const { run: next } = (await res.json()) as {
        run: ShowcaseRunView | null;
      };
      setRun(next);
      if (watching.current && next && !isActive(next)) {
        watching.current = false;
        if (next.status === "done") {
          toast.success(t("projects.showcase.toastSuccess"));
          router.refresh();
        }
      }
    } catch {
      // Offline for a moment (phone); the next poll catches up.
    }
  }, [endpoint, router]);

  const active = isActive(run);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(poll, POLL_MS);
    return () => clearInterval(t);
  }, [active, poll]);

  // Keep the relative times ("il y a 2 min") moving when nothing polls.
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  const start = async () => {
    setBusy(true);
    try {
      const res = await fetch(endpoint, { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as {
        run?: ShowcaseRunView;
        error?: string;
      };
      if (body.run) setRun(body.run);
      if (!res.ok) {
        toast.error(body.error || t("projects.showcase.toastError"));
      }
      if (body.run && isActive(body.run)) watching.current = true;
    } catch {
      toast.error(t("projects.showcase.toastError"));
    } finally {
      setBusy(false);
    }
  };

  const label = hasShowcase
    ? t("projects.showcase.refresh")
    : t("projects.showcase.generate");

  const button = (
    <Button
      onClick={start}
      disabled={!hasPath || busy || active}
      variant={layout === "bar" ? "outline" : "default"}
      size={layout === "bar" ? "sm" : "default"}
      title={
        hasPath
          ? t("projects.showcase.generateTitle")
          : t("projects.showcase.noPathTitle")
      }
    >
      {busy || active ? <Loader2 className="animate-spin" /> : <Sparkles />}
      {label}
    </Button>
  );

  const status = run && <RunStatus run={run} />;
  const noPath = !hasPath && (
    <p className="text-[13px] text-muted-foreground">
      {t("projects.showcase.noPath")}
    </p>
  );

  if (layout === "empty") {
    return (
      <section className="tile mt-6 p-7 md:p-10">
        <p className="etiquette">{t("projects.showcase.empty.title")}</p>
        <p className="mt-4 max-w-xl text-[15px] text-muted-foreground">
          {t("projects.showcase.empty.body")}
        </p>
        <div className="mt-6 flex flex-col items-start gap-3">
          {button}
          {noPath}
          {status}
        </div>
      </section>
    );
  }

  return (
    <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end sm:gap-4">
      <div className="order-2 min-w-0 sm:order-1">{status ?? noPath}</div>
      <div className="order-1 sm:order-2">{button}</div>
    </div>
  );
}

function RunStatus({ run }: { run: ShowcaseRunView }) {
  const t = useT();
  const locale = useLocale();
  const [text, Icon, tone] = (() => {
    switch (run.status) {
      case "queued":
        return [
          t("projects.showcase.status.queued"),
          Clock,
          "text-muted-foreground",
        ] as const;
      case "running":
        return [
          t("projects.showcase.status.running", {
            since: since(run.startedAt ?? run.createdAt, locale),
          }),
          Loader2,
          "text-foreground",
        ] as const;
      case "done":
        return [
          t("projects.showcase.status.done", {
            ago: timeAgo(run.finishedAt ?? run.createdAt, locale),
          }),
          Check,
          "text-muted-foreground",
        ] as const;
      default:
        return [
          t("projects.showcase.status.failed"),
          AlertTriangle,
          "text-destructive",
        ] as const;
    }
  })();

  return (
    <div className="min-w-0 max-w-full text-[13px]">
      <p className={cn("flex items-center gap-1.5 font-medium", tone)}>
        <Icon
          className={cn(
            "h-4 w-4 shrink-0",
            run.status === "running" && "animate-spin"
          )}
        />
        {text}
        {run.status === "failed" && run.finishedAt && (
          <span className="font-normal text-muted-foreground">
            · {timeAgo(run.finishedAt, locale)}
          </span>
        )}
      </p>
      {run.status === "queued" && (
        <p className="mt-0.5 text-muted-foreground">
          {t("projects.showcase.queuedHint")}
        </p>
      )}
      {run.status === "failed" && run.error && (
        <p className="mt-1 break-words text-destructive">{run.error}</p>
      )}
      {run.log && run.status !== "queued" && run.status !== "running" && (
        <details className="mt-1">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
            {t("projects.showcase.runnerLog")}
          </summary>
          <pre className="mt-2 max-h-64 max-w-[calc(100vw-4rem)] overflow-auto whitespace-pre-wrap break-words rounded-lg bg-secondary p-3 text-[11px] leading-5 sm:max-w-xl">
            {run.log}
          </pre>
        </details>
      )}
    </div>
  );
}
