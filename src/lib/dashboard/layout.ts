import { z } from "zod";

/** Every section the dashboard bento can hold, once each. */
export const WIDGET_TYPES = [
  "next-up",
  "today",
  "shortcuts",
  "news",
  "tasks",
  "dossier",
  "schedule",
  "projects",
  "recent",
  "machines",
  "quick-links",
] as const;
export type WidgetType = (typeof WIDGET_TYPES)[number];

/** Grid columns on a wide screen; rows are a fixed height (see BentoGrid). */
export const GRID_COLS = 4;
export const MAX_ROWS = 6;

export interface WidgetMeta {
  title: string;
  description: string;
  /** Size when added. */
  w: number;
  h: number;
  minW?: number;
  minH?: number;
}

export const WIDGETS: Record<WidgetType, WidgetMeta> = {
  "next-up": {
    title: "Prochain événement",
    description: "Le prochain rendez-vous au calendrier.",
    w: 3,
    h: 2,
    minH: 2,
  },
  today: {
    title: "Aujourd'hui",
    description: "La date, la semaine et les tâches du jour.",
    w: 1,
    h: 2,
    minH: 2,
  },
  shortcuts: {
    title: "Raccourcis",
    description: "Tes boutons de lancement, en un tap sur la machine.",
    w: 4,
    h: 1,
  },
  news: {
    title: "Nouvelles",
    description: "Les dernières notifications, non lues d'abord.",
    w: 4,
    h: 3,
    minH: 2,
  },
  tasks: {
    title: "Tâches ouvertes",
    description: "Les tâches à faire, la plus urgente d'abord.",
    w: 1,
    h: 4,
    minH: 2,
  },
  dossier: {
    title: "Dossier",
    description: "Horaire, projets et récents dans un seul bloc à onglets.",
    w: 3,
    h: 4,
    minW: 2,
    minH: 2,
  },
  schedule: {
    title: "Horaire du jour",
    description: "Les événements d'aujourd'hui, dans l'ordre.",
    w: 2,
    h: 3,
    minH: 2,
  },
  projects: {
    title: "Projets",
    description: "Tes projets par organisation, avec leur terminal.",
    w: 2,
    h: 3,
    minH: 2,
  },
  recent: {
    title: "Récents",
    description: "Notes modifiées et enregistrements synchronisés.",
    w: 2,
    h: 3,
    minH: 2,
  },
  machines: {
    title: "Machines",
    description: "Un point par machine : vert, jaune ou rouge.",
    w: 4,
    h: 1,
  },
  "quick-links": {
    title: "Accès rapide",
    description: "Des boutons vers les autres onglets de DreamDash.",
    w: 4,
    h: 1,
  },
};

export interface WidgetSlot {
  type: WidgetType;
  w: number;
  h: number;
}

const slot = (type: WidgetType): WidgetSlot => ({
  type,
  w: WIDGETS[type].w,
  h: WIDGETS[type].h,
});

/** The dashboard as it looked before it became editable, plus Raccourcis. */
export const DEFAULT_LAYOUT: WidgetSlot[] = [
  slot("next-up"),
  slot("today"),
  slot("shortcuts"),
  slot("news"),
  slot("tasks"),
  slot("dossier"),
  slot("machines"),
];

export const clampSize = (type: WidgetType, w: number, h: number) => ({
  w: Math.min(GRID_COLS, Math.max(WIDGETS[type].minW ?? 1, Math.round(w))),
  h: Math.min(MAX_ROWS, Math.max(WIDGETS[type].minH ?? 1, Math.round(h))),
});

export const LayoutInput = z.array(
  z.object({
    type: z.string(),
    w: z.number().finite(),
    h: z.number().finite(),
  })
);

/** Keep known sections, once each, at a legal size. */
export function sanitizeLayout(raw: unknown): WidgetSlot[] | null {
  const parsed = LayoutInput.safeParse(raw);
  if (!parsed.success) return null;
  const seen = new Set<string>();
  const out: WidgetSlot[] = [];
  for (const s of parsed.data) {
    if (!(WIDGET_TYPES as readonly string[]).includes(s.type)) continue;
    if (seen.has(s.type)) continue;
    seen.add(s.type);
    const type = s.type as WidgetType;
    out.push({ type, ...clampSize(type, s.w, s.h) });
  }
  return out;
}
