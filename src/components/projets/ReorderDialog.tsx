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

import { useT } from "@/i18n/client";
import { DEFAULT_PROJECT_COLOR, initials } from "@/lib/projets/meta";

import { Avatar } from "./ImageField";

export type ReorderItem = {
  id: string;
  name: string;
  image?: string | null;
  color: string | null;
};

/**
 * Put a list in order with up/down buttons (rather than drag, so it works the
 * same on a phone), then PUT the ids in that order to `endpoint`.
 */
export function ReorderDialog({
  open,
  onOpenChange,
  title,
  description,
  items,
  endpoint,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  /** In their current display order. */
  items: ReorderItem[];
  endpoint: string;
}) {
  const router = useRouter();
  const t = useT();
  const [order, setOrder] = useState<ReorderItem[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setOrder(items);
  }, [open, items]);

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
      const res = await fetch(endpoint, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids: order.map((o) => o.id) }),
      });
      if (!res.ok) throw new Error(`Erreur ${res.status}`);
      toast.success(t("projects.reorder.saved"));
      onOpenChange(false);
      router.refresh();
    } catch (e) {
      toast.error(t("projects.reorder.error"), {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <ol className="space-y-1.5">
          {order.map((item, i) => (
            <li
              key={item.id}
              className="flex items-center gap-3 rounded-2xl bg-secondary/60 py-2 pl-3 pr-2"
            >
              <span className="w-5 text-center text-[12px] font-semibold tabular-nums text-muted-foreground">
                {i + 1}
              </span>
              <Avatar
                image={item.image}
                fallback={initials(item.name)}
                color={item.color ?? DEFAULT_PROJECT_COLOR}
                shape="rounded"
                className="h-8 w-8 text-[11px]"
              />
              <span className="min-w-0 flex-1 truncate text-[15px] font-semibold tracking-title">
                {item.name}
              </span>
              <button
                type="button"
                onClick={() => move(i, -1)}
                disabled={i === 0}
                className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-card hover:text-foreground disabled:opacity-30"
                aria-label={t("projects.reorder.moveUpAria", {
                  name: item.name,
                })}
              >
                <ArrowUp className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => move(i, 1)}
                disabled={i === order.length - 1}
                className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-card hover:text-foreground disabled:opacity-30"
                aria-label={t("projects.reorder.moveDownAria", {
                  name: item.name,
                })}
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
            {t("common.cancel")}
          </Button>
          <Button type="button" onClick={save} disabled={saving}>
            {saving
              ? t("projects.reorder.saving")
              : t("projects.reorder.save")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
