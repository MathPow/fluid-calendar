"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  type CollisionDetection,
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  type UniqueIdentifier,
  closestCenter,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bell,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  Check,
  FolderGit2,
  GripVertical,
  History,
  Link2,
  ListTodo,
  Monitor,
  PanelsTopLeft,
  Plus,
  RotateCcw,
  Scaling,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import {
  type DashboardData,
  WIDGET_SURFACE,
  renderWidget,
} from "@/components/dashboard/widgets";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

import {
  DEFAULT_LAYOUT,
  GRID_COLS,
  MAX_ROWS,
  WIDGETS,
  WIDGET_TYPES,
  type WidgetSlot,
  type WidgetType,
  clampSize,
} from "@/lib/dashboard/layout";
import { cn } from "@/lib/utils";

import { resolvedLayout, useDashboardLayout } from "@/store/dashboardLayout";

const ICONS: Record<WidgetType, typeof Bell> = {
  "next-up": CalendarClock,
  today: CalendarDays,
  shortcuts: Zap,
  news: Bell,
  tasks: ListTodo,
  dossier: PanelsTopLeft,
  schedule: CalendarRange,
  projects: FolderGit2,
  recent: History,
  machines: Monitor,
  "quick-links": Link2,
};

// Literal class names so Tailwind keeps them. Two columns on a tablet, the
// full four on a desktop; one on a phone.
const COL_SPAN: Record<number, string> = {
  1: "md:col-span-1 lg:col-span-1",
  2: "md:col-span-2 lg:col-span-2",
  3: "md:col-span-2 lg:col-span-3",
  4: "md:col-span-2 lg:col-span-4",
};
const ROW_SPAN: Record<number, string> = {
  1: "row-span-1",
  2: "row-span-2",
  3: "row-span-3",
  4: "row-span-4",
  5: "row-span-5",
  6: "row-span-6",
};

const TRAY = "tray";
const GRID = "grid";
type Container = typeof TRAY | typeof GRID;
type Size = { w: number; h: number };

interface Draft {
  grid: WidgetType[];
  tray: WidgetType[];
  sizes: Record<WidgetType, Size>;
}

const byCatalogOrder = (types: WidgetType[]) =>
  [...types].sort((a, b) => WIDGET_TYPES.indexOf(a) - WIDGET_TYPES.indexOf(b));

function toDraft(layout: WidgetSlot[]): Draft {
  const sizes = Object.fromEntries(
    WIDGET_TYPES.map((t) => [t, { w: WIDGETS[t].w, h: WIDGETS[t].h }])
  ) as Record<WidgetType, Size>;
  for (const s of layout) sizes[s.type] = { w: s.w, h: s.h };
  const grid = layout.map((s) => s.type);
  return {
    grid,
    tray: WIDGET_TYPES.filter((t) => !grid.includes(t)),
    sizes,
  };
}

const fromDraft = (d: Draft): WidgetSlot[] =>
  d.grid.map((type) => ({ type, ...d.sizes[type] }));

const sameLayout = (a: WidgetSlot[], b: WidgetSlot[]) =>
  a.length === b.length &&
  a.every((s, i) => s.type === b[i].type && s.w === b[i].w && s.h === b[i].h);

/**
 * The dashboard as a bento: a four-column grid of sections, each 1–4 columns
 * wide and 1–6 rows tall. In edit mode the sections can be dragged around,
 * resized, removed (✕ or drag them back to the tray) and added from the tray
 * — by dragging one in, or by ticking several and adding them at once.
 */
export function BentoGrid({
  data,
  editing,
  onExit,
}: {
  data: DashboardData;
  editing: boolean;
  onExit: () => void;
}) {
  const { layout, setLayout, load } = useDashboardLayout();
  const saved = resolvedLayout(layout);
  const [draft, setDraft] = useState<Draft>(() => toDraft(saved));
  const [selected, setSelected] = useState<Set<WidgetType>>(new Set());
  const [activeId, setActiveId] = useState<WidgetType | null>(null);
  const [dragFrom, setDragFrom] = useState<Container | null>(null);

  useEffect(() => {
    load();
  }, [load]);

  // Outside edit mode the grid mirrors the saved layout (and server updates).
  useEffect(() => {
    if (!editing) setDraft(toDraft(saved));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, editing]);

  useEffect(() => {
    if (!editing) setSelected(new Set());
  }, [editing]);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // Hold to pick up on a phone, so the page still scrolls under a finger.
    useSensor(TouchSensor, {
      activationConstraint: { delay: 220, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Drag handlers can run from a timer (see onDragOver): read the live draft.
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const containerOf = (id: UniqueIdentifier): Container | null => {
    const d = draftRef.current;
    if (id === GRID || id === TRAY) return id;
    if (d.grid.includes(id as WidgetType)) return GRID;
    if (d.tray.includes(id as WidgetType)) return TRAY;
    return null;
  };

  const lastOverId = useRef<UniqueIdentifier | null>(null);
  const movedContainer = useRef(false);
  const lastSwap = useRef<UniqueIdentifier | null>(null);
  const lastSwapAt = useRef(0);
  const latestOver = useRef<{
    active: UniqueIdentifier;
    over: UniqueIdentifier;
  } | null>(null);
  const swapTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  /**
   * The section under the pointer wins; in a gap, the nearest section of the
   * container under the pointer. Sticks to the last target while the grid
   * reflows after a cross-container move, so it does not flicker back.
   */
  const collision: CollisionDetection = useCallback(
    (args) => {
      const hits = pointerWithin(args);
      const item = hits.find((h) => h.id !== GRID && h.id !== TRAY);
      let overId: UniqueIdentifier | null = item?.id ?? hits[0]?.id ?? null;
      if (overId === GRID || overId === TRAY) {
        const members: UniqueIdentifier[] =
          overId === GRID ? draft.grid : draft.tray;
        const nearest = closestCenter({
          ...args,
          droppableContainers: args.droppableContainers.filter((c) =>
            members.includes(c.id)
          ),
        })[0]?.id;
        // Dropping on the tray never needs a precise slot.
        if (nearest != null && overId === GRID) overId = nearest;
      }
      if (overId != null) {
        lastOverId.current = overId;
        return [{ id: overId }];
      }
      if (movedContainer.current) lastOverId.current = args.active.id;
      return lastOverId.current ? [{ id: lastOverId.current }] : [];
    },
    [draft]
  );

  useEffect(() => {
    requestAnimationFrame(() => {
      movedContainer.current = false;
    });
  }, [draft]);

  const onDragStart = ({ active }: DragStartEvent) => {
    setActiveId(active.id as WidgetType);
    setDragFrom(containerOf(active.id));
    lastSwap.current = null;
    latestOver.current = null;
  };

  /**
   * Moves happen live, so the real layout reflows under the pointer (sizes
   * differ, so sliding neighbours with transforms would lie). A move shifts
   * sections under a still pointer, which can call for the opposite move: at
   * most one move per SWAP_MS, and the latest hover skipped meanwhile is
   * applied when the wait is over.
   */
  const onDragOver = ({ active, over }: DragOverEvent) => {
    latestOver.current = over ? { active: active.id, over: over.id } : null;
    clearTimeout(swapTimer.current);
    const wait = SWAP_MS - (performance.now() - lastSwapAt.current);
    if (wait > 0) swapTimer.current = setTimeout(applyOver, wait);
    else applyOver();
  };

  const applyOver = () => {
    const o = latestOver.current;
    if (!o) return;
    const id = o.active as WidgetType;
    const from = containerOf(id);
    const to = containerOf(o.over);
    if (!from || !to) return;
    // Back over its own slot: the pointer has left the last target.
    if (o.over === id) {
      lastSwap.current = null;
      return;
    }
    if (o.over === lastSwap.current) return;

    if (from !== to) {
      // Into the grid: take the hovered section's slot. Into the tray: append.
      setDraft((d) => {
        const src = d[from].filter((t) => t !== id);
        const dst = d[to].filter((t) => t !== id);
        const at =
          to === GRID && o.over !== GRID
            ? dst.indexOf(o.over as WidgetType)
            : dst.length;
        dst.splice(at < 0 ? dst.length : at, 0, id);
        return { ...d, [from]: src, [to]: dst };
      });
      movedContainer.current = true;
    } else {
      if (to !== GRID || o.over === GRID) return;
      const target = o.over as WidgetType;
      setDraft((d) => {
        const a = d.grid.indexOf(id);
        const b = d.grid.indexOf(target);
        if (a < 0 || b < 0) return d;
        return { ...d, grid: arrayMove(d.grid, a, b) };
      });
    }
    lastSwap.current = o.over;
    lastSwapAt.current = performance.now();
  };

  const onDragEnd = ({ active }: DragEndEvent) => {
    clearTimeout(swapTimer.current);
    const id = active.id as WidgetType;
    const endedIn = containerOf(id);
    if (dragFrom === GRID && endedIn === TRAY) {
      toast(`« ${WIDGETS[id].title} » retirée`, {
        action: { label: "Annuler", onClick: () => addAt([id]) },
      });
    }
    setDraft((d) => ({ ...d, tray: byCatalogOrder(d.tray) }));
    setSelected((s) => {
      const n = new Set(s);
      n.delete(id);
      return n;
    });
    setActiveId(null);
    setDragFrom(null);
  };

  const onDragCancel = () => {
    clearTimeout(swapTimer.current);
    setActiveId(null);
    setDragFrom(null);
  };

  const addAt = (types: WidgetType[]) =>
    setDraft((d) => ({
      ...d,
      grid: [...d.grid, ...types.filter((t) => !d.grid.includes(t))],
      tray: d.tray.filter((t) => !types.includes(t)),
    }));

  const remove = (type: WidgetType) => {
    setDraft((d) => ({
      ...d,
      grid: d.grid.filter((t) => t !== type),
      tray: byCatalogOrder([...d.tray, type]),
    }));
    toast(`« ${WIDGETS[type].title} » retirée`, {
      action: { label: "Annuler", onClick: () => addAt([type]) },
    });
  };

  const resize = (type: WidgetType, w: number, h: number) =>
    setDraft((d) => ({
      ...d,
      sizes: { ...d.sizes, [type]: clampSize(type, w, h) },
    }));

  const addSelected = () => {
    const types = byCatalogOrder([...selected]).filter((t) =>
      draft.tray.includes(t)
    );
    addAt(types);
    setSelected(new Set());
    if (types.length)
      toast.success(
        types.length === 1
          ? `« ${WIDGETS[types[0]].title} » ajoutée`
          : `${types.length} sections ajoutées`
      );
  };

  const finish = () => {
    const next = fromDraft(draft);
    if (!sameLayout(next, saved))
      setLayout(sameLayout(next, DEFAULT_LAYOUT) ? null : next);
    onExit();
  };

  const cancel = () => {
    setDraft(toDraft(saved));
    onExit();
  };

  const reset = () => {
    const before = draft;
    setDraft(toDraft(DEFAULT_LAYOUT));
    toast("Disposition par défaut", {
      action: { label: "Annuler", onClick: () => setDraft(before) },
    });
  };

  const active = activeId;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collision}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
    >
      <AnimatePresence initial={false}>
        {editing && (
          <motion.div
            key="tray"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }}
            className="overflow-hidden"
          >
            <Tray
              items={draft.tray}
              sizes={draft.sizes}
              selected={selected}
              dropToRemove={dragFrom === GRID}
              onToggle={(t) =>
                setSelected((s) => {
                  const n = new Set(s);
                  if (n.has(t)) n.delete(t);
                  else n.add(t);
                  return n;
                })
              }
              onSelectAll={() =>
                setSelected(
                  selected.size === draft.tray.length
                    ? new Set()
                    : new Set(draft.tray)
                )
              }
              onAddOne={(t) => addAt([t])}
              onAddSelected={addSelected}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <GridArea editing={editing} empty={draft.grid.length === 0}>
        <SortableContext items={draft.grid} strategy={noShift}>
          {draft.grid.map((type) => (
            <GridItem
              key={type}
              type={type}
              size={draft.sizes[type]}
              editing={editing}
              onRemove={() => remove(type)}
              onResize={(w, h) => resize(type, w, h)}
            >
              {renderWidget(type, data, draft.sizes[type].w)}
            </GridItem>
          ))}
        </SortableContext>
      </GridArea>

      <DragOverlay dropAnimation={{ duration: 180 }}>
        {active ? (
          dragFrom === GRID ? (
            <GhostTile type={active} size={draft.sizes[active]} lifted />
          ) : (
            <TrayCard type={active} size={draft.sizes[active]} lifted />
          )
        ) : null}
      </DragOverlay>

      <AnimatePresence>
        {editing && (
          <motion.div
            key="bar"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ duration: 0.2 }}
            className="pointer-events-none fixed inset-x-0 bottom-5 z-40 flex justify-center px-4"
          >
            <div className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-popover p-1.5 shadow-float">
              <Button
                variant="ghost"
                size="sm"
                onClick={reset}
                className="rounded-full"
              >
                <RotateCcw className="h-4 w-4" />
                <span className="hidden sm:inline">Par défaut</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={cancel}
                className="rounded-full"
              >
                Annuler
              </Button>
              <Button size="sm" onClick={finish} className="rounded-full px-5">
                <Check className="h-4 w-4" />
                Terminé
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </DndContext>
  );
}

const SWAP_MS = 200;

// Sizes differ, so the grid reflows for real (see onDragOver) instead of
// sliding neighbours with transforms.
const noShift = () => null;

function GridArea({
  editing,
  empty,
  children,
}: {
  editing: boolean;
  empty: boolean;
  children: React.ReactNode;
}) {
  const { setNodeRef } = useDroppable({ id: GRID, disabled: !editing });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "mt-8 grid auto-rows-[9rem] grid-flow-row-dense grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4",
        editing && "pb-24"
      )}
    >
      {children}
      {empty && (
        <div className="col-span-full row-span-2 flex flex-col items-center justify-center rounded-tile border-2 border-dashed border-border text-center">
          <p className="text-[15px] font-semibold tracking-title">
            Le tableau est vide.
          </p>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {editing
              ? "Glisse une section ici depuis le haut."
              : "Clique sur « Personnaliser » pour ajouter des sections."}
          </p>
        </div>
      )}
    </div>
  );
}

function GridItem({
  type,
  size,
  editing,
  onRemove,
  onResize,
  children,
}: {
  type: WidgetType;
  size: Size;
  editing: boolean;
  onRemove: () => void;
  onResize: (w: number, h: number) => void;
  children: React.ReactNode;
}) {
  const { setNodeRef, attributes, listeners, isDragging } = useSortable({
    id: type,
    disabled: !editing,
  });
  const surface = WIDGET_SURFACE[type] ?? "tile";
  const Icon = ICONS[type];

  return (
    <motion.div
      ref={setNodeRef}
      layout={editing ? "position" : false}
      transition={{ type: "spring", stiffness: 520, damping: 42, mass: 0.7 }}
      className={cn("relative min-w-0", COL_SPAN[size.w], ROW_SPAN[size.h])}
    >
      {isDragging ? (
        <GhostTile type={type} size={size} />
      ) : (
        <div
          {...(editing ? { ...attributes, ...listeners } : {})}
          aria-roledescription={editing ? "section déplaçable" : undefined}
          aria-label={editing ? WIDGETS[type].title : undefined}
          className={cn(
            surface,
            "h-full overflow-hidden p-6 md:p-7",
            editing &&
              "cursor-grab touch-manipulation select-none ring-2 ring-border ring-offset-2 ring-offset-background transition-shadow hover:ring-foreground/25 focus-visible:outline-none focus-visible:ring-foreground/50 active:cursor-grabbing"
          )}
        >
          <div
            className={cn(
              "flex h-full min-h-0 flex-col [&>*]:min-h-0 [&>*]:flex-1",
              editing &&
                "pointer-events-none select-none opacity-60 blur-[0.5px]"
            )}
            inert={editing || undefined}
          >
            {children}
          </div>
        </div>
      )}

      {editing && !isDragging && (
        <>
          <div className="pointer-events-none absolute inset-x-3 top-3 flex select-none items-center justify-between">
            <span className="flex items-center gap-1.5 rounded-full bg-popover/95 py-1 pl-1.5 pr-3 text-[12px] font-semibold tracking-title text-foreground shadow-tile">
              <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
              <Icon className="h-3.5 w-3.5" />
              {WIDGETS[type].title}
            </span>
          </div>
          <div
            className="absolute right-3 top-3 flex items-center gap-1"
            onPointerDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <SizePicker type={type} size={size} onPick={onResize} />
            <button
              type="button"
              onClick={onRemove}
              aria-label={`Retirer ${WIDGETS[type].title}`}
              title="Retirer"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-popover/95 text-muted-foreground shadow-tile transition-colors hover:bg-negative hover:text-negative-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </>
      )}
    </motion.div>
  );
}

/** Pick a size on a little 4 × 6 grid, like a table-size picker. */
function SizePicker({
  type,
  size,
  onPick,
}: {
  type: WidgetType;
  size: Size;
  onPick: (w: number, h: number) => void;
}) {
  const [hover, setHover] = useState<Size | null>(null);
  const shown = hover ?? size;
  const minW = WIDGETS[type].minW ?? 1;
  const minH = WIDGETS[type].minH ?? 1;
  return (
    <Popover onOpenChange={() => setHover(null)}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Taille de ${WIDGETS[type].title}`}
          title="Taille"
          className="flex h-8 items-center gap-1.5 rounded-full bg-popover/95 px-2.5 text-[12px] font-semibold tabular-nums text-muted-foreground shadow-tile transition-colors hover:text-foreground"
        >
          <Scaling className="h-3.5 w-3.5" />
          {size.w}×{size.h}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto p-4">
        <p className="etiquette">Taille</p>
        <div
          className="mt-3 grid gap-1"
          style={{ gridTemplateColumns: `repeat(${GRID_COLS}, 1.75rem)` }}
          onMouseLeave={() => setHover(null)}
        >
          {Array.from({ length: MAX_ROWS }, (_, r) =>
            Array.from({ length: GRID_COLS }, (_, c) => {
              const w = c + 1;
              const h = r + 1;
              const on = w <= shown.w && h <= shown.h;
              const allowed = w >= minW && h >= minH;
              return (
                <button
                  key={`${w}-${h}`}
                  type="button"
                  disabled={!allowed}
                  onMouseEnter={() => allowed && setHover({ w, h })}
                  onFocus={() => allowed && setHover({ w, h })}
                  onClick={() => onPick(w, h)}
                  aria-label={`${w} colonne${w > 1 ? "s" : ""} × ${h} rangée${h > 1 ? "s" : ""}`}
                  className={cn(
                    "h-6 rounded-md border transition-colors",
                    on
                      ? "border-foreground bg-foreground"
                      : "border-border bg-secondary",
                    !allowed && "cursor-not-allowed opacity-30"
                  )}
                />
              );
            })
          )}
        </div>
        <p className="mt-3 text-center text-[13px] font-semibold tabular-nums">
          {shown.w} col. × {shown.h} rang.
        </p>
        <p className="text-center text-[11px] text-muted-foreground">
          Sur mobile : pleine largeur
        </p>
      </PopoverContent>
    </Popover>
  );
}

/** The dashed slot a section leaves while it is being dragged. */
function GhostTile({
  type,
  size,
  lifted = false,
}: {
  type: WidgetType;
  size: Size;
  lifted?: boolean;
}) {
  const Icon = ICONS[type];
  return (
    <div
      className={cn(
        "flex h-full w-full flex-col items-center justify-center gap-2 rounded-tile text-center",
        lifted
          ? "rotate-[1.2deg] cursor-grabbing bg-card shadow-float ring-2 ring-foreground/15"
          : "border-2 border-dashed border-foreground/25 bg-secondary/60"
      )}
    >
      <Icon
        className={cn(
          "h-6 w-6",
          lifted ? "text-foreground" : "text-muted-foreground"
        )}
      />
      <p className="text-[14px] font-semibold tracking-title">
        {WIDGETS[type].title}
      </p>
      <p className="text-[12px] tabular-nums text-muted-foreground">
        {size.w}×{size.h}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ tray */

function Tray({
  items,
  sizes,
  selected,
  dropToRemove,
  onToggle,
  onSelectAll,
  onAddOne,
  onAddSelected,
}: {
  items: WidgetType[];
  sizes: Record<WidgetType, Size>;
  selected: Set<WidgetType>;
  dropToRemove: boolean;
  onToggle: (t: WidgetType) => void;
  onSelectAll: () => void;
  onAddOne: (t: WidgetType) => void;
  onAddSelected: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: TRAY });
  const picked = items.filter((t) => selected.has(t)).length;
  return (
    <section
      ref={setNodeRef}
      className={cn(
        "mt-8 rounded-tile border-2 border-dashed p-5 transition-colors md:p-6",
        dropToRemove
          ? isOver
            ? "border-negative-foreground/60 bg-negative/60"
            : "border-negative-foreground/30 bg-negative/25"
          : "border-border bg-secondary/40"
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="etiquette">Sections disponibles</p>
          <p className="mt-2 text-[13px] text-muted-foreground">
            {dropToRemove
              ? "Lâche ici pour retirer la section du tableau."
              : "Glisse une section dans la grille, ou coches-en plusieurs et ajoute-les d'un coup. Pour en retirer une, ramène-la ici."}
          </p>
        </div>
        {items.length > 0 && (
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onSelectAll}>
              {picked === items.length ? "Tout décocher" : "Tout cocher"}
            </Button>
            <Button size="sm" disabled={picked === 0} onClick={onAddSelected}>
              <Plus className="h-4 w-4" />
              Ajouter{picked > 0 ? ` (${picked})` : ""}
            </Button>
          </div>
        )}
      </div>

      <SortableContext items={items} strategy={noShift}>
        <div className="mt-4 grid min-h-[4.75rem] grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.length === 0 && !dropToRemove && (
            <p className="col-span-full flex items-center justify-center text-[13px] text-muted-foreground">
              Toutes les sections sont déjà sur le tableau.
            </p>
          )}
          {items.map((t) => (
            <TrayItem
              key={t}
              type={t}
              size={sizes[t]}
              checked={selected.has(t)}
              onToggle={() => onToggle(t)}
              onAdd={() => onAddOne(t)}
            />
          ))}
        </div>
      </SortableContext>
    </section>
  );
}

function TrayItem({
  type,
  size,
  checked,
  onToggle,
  onAdd,
}: {
  type: WidgetType;
  size: Size;
  checked: boolean;
  onToggle: () => void;
  onAdd: () => void;
}) {
  const { setNodeRef, attributes, listeners, isDragging } = useSortable({
    id: type,
  });
  return (
    <div ref={setNodeRef} className={cn(isDragging && "opacity-40")}>
      <TrayCard
        type={type}
        size={size}
        checked={checked}
        onToggle={onToggle}
        onAdd={onAdd}
        handleProps={{ ...attributes, ...listeners }}
      />
    </div>
  );
}

function TrayCard({
  type,
  size,
  checked = false,
  lifted = false,
  onToggle,
  onAdd,
  handleProps,
}: {
  type: WidgetType;
  size: Size;
  checked?: boolean;
  lifted?: boolean;
  onToggle?: () => void;
  onAdd?: () => void;
  handleProps?: Record<string, unknown>;
}) {
  const Icon = ICONS[type];
  return (
    <div
      {...handleProps}
      onClick={onToggle}
      role={onToggle ? "checkbox" : undefined}
      aria-checked={onToggle ? checked : undefined}
      className={cn(
        "group flex h-[4.75rem] cursor-grab touch-manipulation select-none items-center gap-3 rounded-2xl bg-card p-3 pr-2 shadow-tile ring-2 transition-[box-shadow,transform] active:cursor-grabbing",
        checked ? "ring-foreground" : "ring-transparent hover:ring-border",
        lifted && "rotate-[-1.5deg] shadow-float ring-foreground/15"
      )}
    >
      <span
        className={cn(
          "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors",
          checked ? "bg-foreground text-background" : "bg-secondary"
        )}
      >
        {checked ? <Check className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="truncate text-[14px] font-semibold tracking-title">
            {WIDGETS[type].title}
          </span>
          <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
            {size.w}×{size.h}
          </span>
        </span>
        <span className="line-clamp-2 text-[12px] leading-snug text-muted-foreground">
          {WIDGETS[type].description}
        </span>
      </span>
      {onAdd && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onAdd();
          }}
          onPointerDown={(e) => e.stopPropagation()}
          aria-label={`Ajouter ${WIDGETS[type].title}`}
          title="Ajouter"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <Plus className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
