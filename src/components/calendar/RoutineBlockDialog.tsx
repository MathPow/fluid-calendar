"use client";

import { useEffect, useState } from "react";

import { Check, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

import { PROJECT_COLORS } from "@/lib/projets/meta";
import {
  ROUTINE_KINDS,
  type RoutineKind,
  WEEKDAYS_FR,
  crossesMidnight,
  routineColor,
} from "@/lib/routine";
import { cn } from "@/lib/utils";

import { useRoutineStore } from "@/store/routine";
import { useSettingsStore } from "@/store/settings";

const EMPTY = {
  title: "",
  kind: "work" as RoutineKind,
  color: null as string | null,
  days: [1, 2, 3, 4, 5],
  startTime: "09:00",
  endTime: "17:00",
  schedulable: true,
  layerId: undefined as string | undefined,
};

/** Create / edit one block of the weekly routine. Driven by the routine store. */
export function RoutineBlockDialog() {
  const dialog = useRoutineStore((s) => s.dialog);
  const layers = useRoutineStore((s) => s.layers);
  const { closeDialog, createBlock, updateBlock, deleteBlock } =
    useRoutineStore.getState();
  const weekStartsMonday = useSettingsStore(
    (s) => s.user.weekStartDay === "monday"
  );

  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const block = dialog?.block ?? null;

  useEffect(() => {
    if (!dialog) return;
    if (dialog.block) {
      const b = dialog.block;
      setForm({
        title: b.title,
        kind: b.kind as RoutineKind,
        color: b.color,
        days: b.days,
        startTime: b.startTime,
        endTime: b.endTime,
        schedulable: b.schedulable,
        layerId: b.layerId,
      });
    } else {
      const draft = dialog.draft ?? {};
      const kind = (draft.kind as RoutineKind) ?? EMPTY.kind;
      setForm({
        ...EMPTY,
        ...draft,
        kind,
        title: draft.title ?? "",
        color: draft.color ?? null,
        schedulable:
          draft.schedulable ??
          ROUTINE_KINDS.find((k) => k.value === kind)!.schedulable,
        layerId: draft.layerId ?? layers[0]?.id,
      });
    }
  }, [dialog, layers]);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const pickKind = (kind: RoutineKind) => {
    const preset = ROUTINE_KINDS.find((k) => k.value === kind)!;
    setForm((f) => ({
      ...f,
      kind,
      // A title still equal to the previous kind's label follows the new kind.
      title:
        !f.title || ROUTINE_KINDS.some((k) => k.label === f.title)
          ? preset.label
          : f.title,
      schedulable: block ? f.schedulable : preset.schedulable,
    }));
  };

  const toggleDay = (d: number) =>
    set(
      "days",
      form.days.includes(d)
        ? form.days.filter((x) => x !== d)
        : [...form.days, d].sort()
    );

  const submit = async () => {
    setSaving(true);
    const draft = {
      ...form,
      title:
        form.title.trim() ||
        ROUTINE_KINDS.find((k) => k.value === form.kind)!.label,
    };
    const ok = block
      ? await updateBlock(block.id, draft)
      : await createBlock(draft);
    setSaving(false);
    if (ok) closeDialog();
  };

  const remove = async () => {
    if (!block) return;
    await deleteBlock(block.id);
    closeDialog();
  };

  const dayOrder = weekStartsMonday
    ? [1, 2, 3, 4, 5, 6, 0]
    : [0, 1, 2, 3, 4, 5, 6];
  const color = routineColor(form);

  return (
    <Dialog open={!!dialog} onOpenChange={(open) => !open && closeDialog()}>
      <DialogContent className="flex flex-col gap-0 overflow-y-hidden p-0 md:p-0 max-w-lg">
        <DialogHeader className="space-y-1.5 px-6 pb-4 pt-6 md:px-8 md:pt-8">
          <DialogTitle>
            {block ? "Modifier le bloc" : "Nouveau bloc"}
          </DialogTitle>
          <DialogDescription>
            Un moment qui revient chaque semaine. Il s&apos;affiche derrière ton
            calendrier et s&apos;efface là où un vrai événement le remplace.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 pb-6 md:px-8 md:pb-8">
          <form
            id="routine-form"
            className="space-y-6"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <div className="space-y-2">
              <Label>Type</Label>
              <div className="flex flex-wrap gap-2">
                {ROUTINE_KINDS.map((k) => (
                  <button
                    key={k.value}
                    type="button"
                    onClick={() => pickKind(k.value)}
                    aria-pressed={form.kind === k.value}
                    className={cn(
                      "flex items-center gap-2 rounded-full border-2 px-3.5 py-1.5 text-[13px] font-medium transition-colors",
                      form.kind === k.value
                        ? "border-foreground bg-tint-soft"
                        : "border-transparent bg-secondary hover:bg-border/70"
                    )}
                  >
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: k.color }}
                    />
                    {k.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="routine-title">Titre</Label>
              <Input
                id="routine-title"
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder={
                  ROUTINE_KINDS.find((k) => k.value === form.kind)!.label
                }
                className="text-[16px] font-semibold tracking-title"
              />
            </div>

            <div className="space-y-2">
              <Label>Jours</Label>
              <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-7">
                {dayOrder.map((d) => {
                  const on = form.days.includes(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => toggleDay(d)}
                      aria-pressed={on}
                      className={cn(
                        "h-11 min-w-11 rounded-xl text-[13px] font-semibold transition-colors",
                        on
                          ? "bg-foreground text-background"
                          : "bg-secondary text-muted-foreground hover:bg-border/70"
                      )}
                    >
                      {WEEKDAYS_FR[d]}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="routine-start">Début</Label>
                <Input
                  id="routine-start"
                  type="time"
                  step={900}
                  value={form.startTime}
                  onChange={(e) => set("startTime", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="routine-end">Fin</Label>
                <Input
                  id="routine-end"
                  type="time"
                  step={900}
                  value={form.endTime}
                  onChange={(e) => set("endTime", e.target.value)}
                />
              </div>
            </div>
            {form.startTime !== form.endTime && crossesMidnight(form) && (
              <p className="-mt-3 text-[12px] text-muted-foreground">
                Finit le lendemain à {form.endTime}.
              </p>
            )}

            <div className="space-y-2">
              <Label>Couleur</Label>
              <div className="flex flex-wrap gap-2">
                {[
                  ROUTINE_KINDS.find((k) => k.value === form.kind)!.color,
                  ...PROJECT_COLORS.map((c) => c.hex),
                ]
                  .filter((c, i, all) => all.indexOf(c) === i)
                  .map((hex, i) => {
                    const active = color.toLowerCase() === hex.toLowerCase();
                    return (
                      <button
                        key={hex}
                        type="button"
                        onClick={() => set("color", i === 0 ? null : hex)}
                        className={cn(
                          "flex h-11 w-11 items-center justify-center rounded-xl border-2 transition-transform hover:scale-105",
                          active ? "border-foreground" : "border-transparent"
                        )}
                        style={{ backgroundColor: hex }}
                        aria-pressed={active}
                        aria-label={`Couleur ${hex}`}
                        title={i === 0 ? "Couleur du type" : undefined}
                      >
                        {active && (
                          <Check
                            className="h-4 w-4 text-[#19181c]"
                            strokeWidth={3}
                          />
                        )}
                      </button>
                    );
                  })}
              </div>
            </div>

            <label className="flex items-start justify-between gap-4 rounded-2xl bg-secondary px-4 py-3">
              <span>
                <span className="block text-[14px] font-semibold tracking-title">
                  Planifier des tâches ici
                </span>
                <span className="block text-[12px] text-muted-foreground">
                  La planification automatique place tes tâches seulement dans
                  les blocs cochés.
                </span>
              </span>
              <Switch
                checked={form.schedulable}
                onCheckedChange={(v) => set("schedulable", v)}
              />
            </label>

            {layers.length > 1 && (
              <div className="space-y-2">
                <Label>Calque</Label>
                <div className="flex flex-wrap gap-2">
                  {layers.map((l) => (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => set("layerId", l.id)}
                      aria-pressed={form.layerId === l.id}
                      className={cn(
                        "rounded-full border-2 px-3.5 py-1.5 text-[13px] font-medium",
                        form.layerId === l.id
                          ? "border-foreground bg-tint-soft"
                          : "border-transparent bg-secondary"
                      )}
                    >
                      {l.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </form>
        </div>

        <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-border bg-card px-6 py-4 md:px-8 sm:flex-row sm:items-center">
          {block && (
            <Button
              type="button"
              variant="ghost"
              className="text-negative-foreground hover:bg-negative hover:text-negative-foreground sm:mr-auto"
              onClick={remove}
              disabled={saving}
            >
              <Trash2 /> Supprimer
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={closeDialog}
            disabled={saving}
            className="sm:ml-auto"
          >
            Annuler
          </Button>
          <Button
            type="submit"
            form="routine-form"
            disabled={saving || form.days.length === 0}
          >
            {saving ? "Enregistrement…" : block ? "Enregistrer" : "Créer"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
