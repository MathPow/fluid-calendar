"use client";

import { useState } from "react";

import {
  Layers,
  MoreHorizontal,
  PenLine,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import {
  type RoutineBlockLite,
  crossesMidnight,
  formatDays,
  routineColor,
} from "@/lib/routine";
import { cn } from "@/lib/utils";

import { useViewStore } from "@/store/calendar";
import { useRoutineStore } from "@/store/routine";
import { useSettingsStore } from "@/store/settings";

/** A first week to edit rather than an empty screen: the usual three blocks. */
const STARTER: Omit<RoutineBlockLite, "id" | "layerId">[] = [
  {
    title: "Travail",
    kind: "work",
    color: null,
    days: [1, 2, 3, 4, 5],
    startTime: "09:00",
    endTime: "17:00",
    schedulable: true,
  },
  {
    title: "Sommeil",
    kind: "sleep",
    color: null,
    days: [0, 1, 2, 3, 4, 5, 6],
    startTime: "23:00",
    endTime: "07:00",
    schedulable: false,
  },
  {
    title: "Entraînement",
    kind: "sport",
    color: null,
    days: [1, 3, 5],
    startTime: "07:15",
    endTime: "08:15",
    schedulable: false,
  },
];

/**
 * Calendar sidebar section for the routine layers (« Semaine type »): show or
 * hide each layer, list its blocks, and switch to « Dessiner » mode to draw
 * and move blocks right in the week view.
 */
export function RoutineLayers() {
  const layers = useRoutineStore((s) => s.layers);
  const loaded = useRoutineStore((s) => s.loaded);
  const editing = useRoutineStore((s) => s.editing);
  const store = useRoutineStore.getState();
  const weekStartsMonday = useSettingsStore(
    (s) => s.user.weekStartDay === "monday"
  );
  const { view, setView } = useViewStore();
  const [seeding, setSeeding] = useState(false);

  const toggleEditing = () => {
    if (!editing && view !== "week" && view !== "day") setView("week");
    store.setEditing(!editing);
  };

  const seed = async () => {
    setSeeding(true);
    for (const block of STARTER) await store.createBlock(block);
    setSeeding(false);
  };

  const hasBlocks = layers.some((l) => l.blocks.length > 0);

  return (
    <div className="space-y-3 border-t border-border px-4 py-5">
      <div className="flex items-center gap-2 px-1">
        <Layers className="h-4 w-4 text-muted-foreground" />
        <span className="flex-1 text-[13px] font-semibold tracking-title">
          Blocs fantômes · calques
        </span>
        <button
          type="button"
          onClick={() => store.openNewBlock()}
          className="rounded-full p-1.5 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
          title="Nouveau bloc"
          aria-label="Nouveau bloc"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {loaded && !hasBlocks && (
        <div className="rounded-2xl bg-secondary px-4 py-3.5">
          <p className="text-[13px] leading-snug text-muted-foreground">
            Dessine ta semaine type (travail, sommeil, sport) derrière ton
            calendrier. Les vrais événements passent par-dessus.
          </p>
          <button
            type="button"
            onClick={seed}
            disabled={seeding}
            className="mt-3 rounded-full bg-foreground px-3.5 py-1.5 text-[12px] font-semibold text-background disabled:opacity-50"
          >
            {seeding ? "Création…" : "Commencer avec un modèle"}
          </button>
        </div>
      )}

      {layers.map((layer) => (
        <div key={layer.id} className="space-y-1">
          <div className="group flex items-center gap-2.5 rounded-xl px-1 py-1">
            <Checkbox
              checked={layer.visible}
              onCheckedChange={() => store.toggleLayer(layer.id)}
              aria-label={`Afficher ${layer.name}`}
            />
            <span className="flex-1 truncate text-[14px] font-medium">
              {layer.name}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {layer.blocks.length}
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="rounded-full p-1 text-muted-foreground md:opacity-60 hover:bg-muted/50 hover:text-foreground group-hover:opacity-100"
                  aria-label={`Options de ${layer.name}`}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onSelect={() => store.openNewBlock({ layerId: layer.id })}
                >
                  <Plus /> Ajouter un bloc
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => {
                    const name = window
                      .prompt("Nom du calque", layer.name)
                      ?.trim();
                    if (name && name !== layer.name)
                      store.renameLayer(layer.id, name);
                  }}
                >
                  <Pencil /> Renommer
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => {
                    const name = window
                      .prompt("Nom du nouveau calque", "Été")
                      ?.trim();
                    if (name) store.createLayer(name);
                  }}
                >
                  <Layers /> Nouveau calque
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-negative-foreground focus:bg-negative focus:text-negative-foreground"
                  onSelect={() => {
                    if (
                      window.confirm(
                        `Supprimer « ${layer.name} » et ses blocs ?`
                      )
                    ) {
                      store.deleteLayer(layer.id);
                    }
                  }}
                >
                  <Trash2 /> Supprimer
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <ul className={cn("space-y-0.5", !layer.visible && "opacity-50")}>
            {layer.blocks.map((b) => (
              <li key={b.id}>
                <button
                  type="button"
                  onClick={() => store.openBlock(b)}
                  className="flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left hover:bg-muted/50"
                >
                  <span
                    className="h-3 w-3 shrink-0 rounded-[4px]"
                    style={{ backgroundColor: routineColor(b) }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium">
                      {b.title}
                    </span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {formatDays(b.days, weekStartsMonday)} · {b.startTime}–
                      {b.endTime}
                      {crossesMidnight(b) && " (+1)"}
                      {b.schedulable && " · tâches"}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}

      {hasBlocks && (
        <button
          type="button"
          onClick={toggleEditing}
          aria-pressed={editing}
          className={cn(
            "flex w-full items-center justify-center gap-2 rounded-full border-[1.5px] px-3.5 py-2 text-[13px] font-semibold transition-colors",
            editing
              ? "border-foreground bg-foreground text-background"
              : "border-foreground text-foreground hover:bg-foreground hover:text-background"
          )}
        >
          <PenLine className="h-4 w-4" />
          {editing ? "Terminer" : "Dessiner dans la semaine"}
        </button>
      )}
    </div>
  );
}
