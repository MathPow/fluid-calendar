"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

import { useT } from "@/i18n/client";

type Pending = (ok: boolean) => void;

/**
 * The machine routes answer 403 `step_up_required` until the PIN was given in
 * the last 15 minutes. This wraps `fetch` once: on that answer it asks for
 * the PIN, then replays the same request, so no caller has to know about it.
 */
export function StepUpProvider() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const waiters = useRef<Pending[]>([]);

  useEffect(() => {
    const original = window.fetch.bind(window);

    const askPin = () =>
      new Promise<boolean>((resolve) => {
        waiters.current.push(resolve);
        setOpen(true);
      });

    window.fetch = async (input, init) => {
      const res = await original(input, init);
      if (res.status !== 403) return res;
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      if (!new URL(url, location.href).pathname.startsWith("/api/")) return res;
      const body = await res
        .clone()
        .json()
        .catch(() => null);
      if (body?.error !== "step_up_required") return res;
      if (!(await askPin())) return res;
      return original(input, init);
    };
    return () => {
      window.fetch = original;
    };
  }, []);

  const settle = (ok: boolean) => {
    waiters.current.splice(0).forEach((resolve) => resolve(ok));
    setOpen(false);
    setPin("");
    setError(null);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/step-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      if (res.ok) return settle(true);
      const body = await res.json().catch(() => null);
      setError(body?.error ?? t("auth.stepUp.pinRejected"));
      setPin("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && settle(false)}>
      <DialogContent className="sm:max-w-xs">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{t("auth.stepUp.title")}</DialogTitle>
            <DialogDescription>
              {t("auth.stepUp.description")}
            </DialogDescription>
          </DialogHeader>
          <Input
            type="password"
            inputMode="numeric"
            autoComplete="off"
            autoFocus
            value={pin}
            onChange={(e) => setPin(e.target.value)}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={busy || !pin}>
              {t("auth.stepUp.submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
