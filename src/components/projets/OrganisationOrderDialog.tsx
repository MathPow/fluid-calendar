"use client";

import { useEffect, useState } from "react";

import { useRouter } from "next/navigation";

import { ArrowDown, ArrowUp } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { DEFAULT_PROJECT_COLOR, initials } from "@/lib/projets/meta";
import type { OrganisationLite } from "@/lib/projets/queries";

import { Avatar } from "./ImageField";

/**
 * Put the organisations in the order they should appear everywhere: Projets,
 * the calendar sidebar and Tasks. Up/down buttons rather than drag, so it
 * works the same on a phone.
 */
export function OrganisationOrderDialog({
  open,
  onOpenChange,
  organisations,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** In their current display order. */
  organisations: OrganisationLite[];
}) {
  const router = useRouter();
  const [order, setOrder] = useState<OrganisationLite[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setOrder(organisations);
  }, [open, organisations]);

  const move = (i: number, delta: number) =>
    setOrder((prev) => {
      const j = i + delta;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/organisations/order", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids: order.map((o) => o.id) }),
      });
      if (!res.ok) throw new Error(`Erreur ${res.status}`);
      toast.success("Ordre enregistré.");
      onOpenChange(false);
      router.refresh();
    } catch (e) {
      toast.error("Enregistrement impossible", {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ordre des organisations</DialogTitle>
          <DialogDescription>
            Le même ordre s&apos;applique dans Projets, le calendrier et les
            tâches.
          </DialogDescription>
        </DialogHeader>

        <ol className="space-y-1.5">
          {order.map((org, i) => (
            <li
              key={org.id}
              className="flex items-center gap-3 rounded-2xl bg-secondary/60 py-2 pl-3 pr-2"
            >
              <span className="w-5 text-center text-[12px] font-semibold tabular-nums text-muted-foreground">
                {i + 1}
              </span>
              <Avatar
                image={org.image}
                fallback={initials(org.name)}
                color={org.color ?? DEFAULT_PROJECT_COLOR}
                shape="rounded"
                className="h-8 w-8 text-[11px]"
              />
              <span className="min-w-0 flex-1 truncate text-[15px] font-semibold tracking-title">
                {org.name}
              </span>
              <button
                type="button"
                onClick={() => move(i, -1)}
                disabled={i === 0}
                className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-card hover:text-foreground disabled:opacity-30"
                aria-label={`Monter ${org.name}`}
              >
                <ArrowUp className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => move(i, 1)}
                disabled={i === order.length - 1}
                className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-card hover:text-foreground disabled:opacity-30"
                aria-label={`Descendre ${org.name}`}
              >
                <ArrowDown className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ol>

        <div className="flex justify-end gap-2 border-t border-border pt-5">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Annuler
          </Button>
          <Button type="button" onClick={save} disabled={saving}>
            {saving ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
