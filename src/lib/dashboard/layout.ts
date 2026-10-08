import { z } from "zod";

/** Every section the dashboard bento can hold, once each. */
export const WIDGET_TYPES = [
  "next-up",
  "today",
  "month",
  "shortcuts",
  "news",
  "tasks",
  "dossier",
  "schedule",
  "projects",
  "recent",
  "machines",
  "quick-links",
  "sticky",
] as const;
export type WidgetType = (typeof WIDGET_TYPES)[number];

/** Grid columns on a wide screen; rows are a fixed height (see BentoGrid). */
export const GRID_COLS = 4;

/**
 * A designed format: a size plus the layout the section uses at that size.
 * Sections only come in these, so each one always looks composed.
 */
export interface Preset {
  id: string;
  label: string;
  w: number;
  h: number;
}

export type OptionDef =
  | { key: string; label: string; kind: "bool"; default: boolean }
  | {
      key: string;
      label: string;
      kind: "choice";
      choices: { value: string; label: string }[];
      default: string;
    }
  | {
      key: string;
      label: string;
      kind: "multi";
      choices: { value: string; label: string }[];
      default: string[];
    }
  | { key: string; label: string; kind: "links"; default: CustomLink[] };

/**
 * A link the user added to « Accès rapide »: any address, or a project /
 * organisation page or link imported from Projets. `kind` picks the icon
 * (a Projets link kind, or "project" / "org" for a coloured initials mark).
 */
export interface CustomLink {
  id: string;
  label: string;
  url: string;
  kind: string;
  color?: string;
}

export type WidgetOptions = Record<
  string,
  boolean | string | string[] | CustomLink[]
>;

export const MAX_CUSTOM_LINKS = 30;

export const CustomLinkInput = z.object({
  id: z.string().min(1).max(40),
  label: z.string().trim().min(1).max(40),
  // Absolute http(s), or a path inside DreamDash.
  url: z
    .string()
    .trim()
    .max(2000)
    .refine(
      (u) => /^https?:\/\//i.test(u) || /^\/(?!\/)/.test(u),
      "Adresse invalide"
    ),
  kind: z.string().max(20).default("other"),
  color: z
    .string()
    .regex(/^#[0-9a-f]{3,8}$/i)
    .optional()
    .catch(undefined),
});

export interface WidgetMeta {
  title: string;
  description: string;
  /** First one is the default. */
  presets: Preset[];
  options: OptionDef[];
}

export const QUICK_LINK_IDS = [
  "calendar",
  "tasks",
  "focus",
  "email",
  "notes",
  "projets",
  "contacts",
  "machines",
  "fiscalite",
  "settings",
] as const;

const QUICK_LINK_LABELS: Record<(typeof QUICK_LINK_IDS)[number], string> = {
  calendar: "Calendrier",
  tasks: "Tâches",
  focus: "Focus",
  email: "Courriel",
  notes: "Notes",
  projets: "Projets",
  contacts: "Contacts",
  machines: "Machines",
  fiscalite: "Fiscalité",
  settings: "Réglages",
};

const count = (values: number[]) =>
  values.map((v) => ({ value: String(v), label: String(v) }));

export const WIDGETS: Record<WidgetType, WidgetMeta> = {
  "next-up": {
    title: "Prochain événement",
    description: "Le prochain rendez-vous au calendrier.",
    presets: [
      { id: "hero", label: "Bannière", w: 3, h: 2 },
      { id: "strip", label: "Bandeau", w: 4, h: 1 },
      { id: "square", label: "Carré", w: 2, h: 2 },
      { id: "compact", label: "Compact", w: 1, h: 2 },
    ],
    options: [
      {
        key: "location",
        label: "Lieu et calendrier",
        kind: "bool",
        default: true,
      },
      {
        key: "after",
        label: "Événements suivants",
        kind: "choice",
        choices: count([0, 2, 3]),
        default: "0",
      },
    ],
  },
  today: {
    title: "Aujourd'hui",
    description: "La date, la semaine et les tâches du jour.",
    presets: [
      { id: "tile", label: "Tuile", w: 1, h: 2 },
      { id: "mini", label: "Mini", w: 1, h: 1 },
      { id: "wide", label: "Large", w: 2, h: 2 },
    ],
    options: [
      { key: "week", label: "Numéro de semaine", kind: "bool", default: true },
      { key: "due", label: "Tâches dues", kind: "bool", default: true },
    ],
  },
  month: {
    title: "Mois",
    description: "Le mois en grille, un point sur chaque jour chargé.",
    presets: [
      { id: "compact", label: "Compact", w: 1, h: 3 },
      { id: "split", label: "Côte à côte", w: 2, h: 3 },
      { id: "large", label: "Grand", w: 4, h: 3 },
    ],
    options: [
      { key: "tasks", label: "Tâches dues", kind: "bool", default: true },
      {
        key: "weekStart",
        label: "La semaine commence",
        kind: "choice",
        choices: [
          { value: "auto", label: "Réglages" },
          { value: "monday", label: "Lundi" },
          { value: "sunday", label: "Dimanche" },
        ],
        default: "auto",
      },
    ],
  },
  shortcuts: {
    title: "Raccourcis",
    description: "Tes boutons de lancement, en un tap sur la machine.",
    presets: [
      { id: "row", label: "Rangée", w: 4, h: 1 },
      { id: "half", label: "Demi", w: 2, h: 1 },
      { id: "pad", label: "Pavé", w: 2, h: 2 },
      { id: "column", label: "Colonne", w: 1, h: 3 },
    ],
    options: [
      {
        key: "machine",
        label: "Nom de la machine",
        kind: "bool",
        default: true,
      },
      { key: "add", label: "Bouton « + »", kind: "bool", default: true },
    ],
  },
  news: {
    title: "Nouvelles",
    description: "Les dernières notifications, non lues d'abord.",
    presets: [
      { id: "wide", label: "Large", w: 4, h: 3 },
      { id: "strip", label: "Bande", w: 4, h: 2 },
      { id: "half", label: "Demi", w: 2, h: 3 },
      { id: "column", label: "Colonne", w: 1, h: 3 },
    ],
    options: [
      {
        key: "unreadOnly",
        label: "Non lues seulement",
        kind: "bool",
        default: false,
      },
    ],
  },
  tasks: {
    title: "Tâches ouvertes",
    description: "Les tâches à faire, la plus urgente d'abord.",
    presets: [
      { id: "column", label: "Colonne", w: 1, h: 4 },
      { id: "list", label: "Liste", w: 2, h: 3 },
      { id: "wide", label: "Deux colonnes", w: 4, h: 2 },
      { id: "compact", label: "Compact", w: 1, h: 2 },
    ],
    options: [
      {
        key: "filter",
        label: "Afficher",
        kind: "choice",
        choices: [
          { value: "all", label: "Toutes" },
          { value: "soon", label: "Dues ≤ 7 j" },
          { value: "active", label: "En cours" },
        ],
        default: "all",
      },
      {
        key: "limit",
        label: "Nombre",
        kind: "choice",
        choices: [...count([5, 10, 20]), { value: "all", label: "Tout" }],
        default: "10",
      },
      { key: "due", label: "Échéances", kind: "bool", default: true },
    ],
  },
  dossier: {
    title: "Dossier",
    description: "Horaire, projets et récents dans un seul bloc à onglets.",
    presets: [
      { id: "standard", label: "Standard", w: 3, h: 4 },
      { id: "wide", label: "Large", w: 4, h: 3 },
      { id: "half", label: "Demi", w: 2, h: 4 },
    ],
    options: [
      {
        key: "tab",
        label: "Onglet de départ",
        kind: "choice",
        choices: [
          { value: "schedule", label: "Horaire" },
          { value: "projects", label: "Projets" },
          { value: "recent", label: "Récents" },
        ],
        default: "schedule",
      },
    ],
  },
  schedule: {
    title: "Horaire",
    description: "Les événements à venir, dans l'ordre.",
    presets: [
      { id: "list", label: "Liste", w: 2, h: 3 },
      { id: "column", label: "Colonne", w: 1, h: 3 },
      { id: "wide", label: "Large", w: 4, h: 2 },
    ],
    options: [
      {
        key: "range",
        label: "Période",
        kind: "choice",
        choices: [
          { value: "today", label: "Aujourd'hui" },
          { value: "3d", label: "3 jours" },
          { value: "week", label: "7 jours" },
        ],
        default: "today",
      },
      {
        key: "calendar",
        label: "Nom du calendrier",
        kind: "bool",
        default: true,
      },
    ],
  },
  projects: {
    title: "Projets",
    description: "Tes projets par organisation, avec leur terminal.",
    presets: [
      { id: "list", label: "Liste", w: 2, h: 3 },
      { id: "wide", label: "Colonnes", w: 4, h: 3 },
      { id: "column", label: "Colonne", w: 1, h: 3 },
    ],
    options: [
      {
        key: "top",
        label: "Projets par organisation",
        kind: "choice",
        choices: count([2, 4, 6]),
        default: "4",
      },
      {
        key: "description",
        label: "Descriptions",
        kind: "bool",
        default: true,
      },
    ],
  },
  recent: {
    title: "Récents",
    description: "Notes modifiées et enregistrements synchronisés.",
    presets: [
      { id: "list", label: "Liste", w: 2, h: 3 },
      { id: "column", label: "Colonne", w: 1, h: 3 },
      { id: "wide", label: "Deux colonnes", w: 4, h: 2 },
    ],
    options: [
      {
        key: "kind",
        label: "Afficher",
        kind: "choice",
        choices: [
          { value: "all", label: "Tout" },
          { value: "note", label: "Notes" },
          { value: "recording", label: "Enregistr." },
        ],
        default: "all",
      },
    ],
  },
  machines: {
    title: "Machines",
    description: "Un point par machine : vert, jaune ou rouge.",
    presets: [
      { id: "strip", label: "Bandeau", w: 4, h: 1 },
      { id: "half", label: "Demi", w: 2, h: 1 },
      { id: "list", label: "Liste", w: 1, h: 2 },
      { id: "grid", label: "Grille", w: 2, h: 2 },
    ],
    options: [
      {
        key: "unmonitored",
        label: "Machines non surveillées",
        kind: "bool",
        default: true,
      },
    ],
  },
  "quick-links": {
    title: "Accès rapide",
    description: "Des boutons vers les autres onglets de DreamDash.",
    presets: [
      { id: "row", label: "Rangée", w: 4, h: 1 },
      { id: "icons", label: "Icônes", w: 2, h: 1 },
      { id: "grid", label: "Grille", w: 2, h: 2 },
      { id: "column", label: "Colonne", w: 1, h: 3 },
    ],
    options: [
      {
        key: "links",
        label: "Onglets",
        kind: "multi",
        choices: QUICK_LINK_IDS.map((id) => ({
          value: id,
          label: QUICK_LINK_LABELS[id],
        })),
        default: [...QUICK_LINK_IDS],
      },
      { key: "custom", label: "Mes liens", kind: "links", default: [] },
    ],
  },
  sticky: {
    title: "Pense-bête",
    description:
      "Des petites notes rapides, gardées dans Notes ▸ Pense-bête, colorées par organisation.",
    presets: [
      { id: "board", label: "Tableau", w: 2, h: 3 },
      { id: "column", label: "Colonne", w: 1, h: 3 },
      { id: "wide", label: "Large", w: 4, h: 2 },
    ],
    options: [],
  },
};

export interface WidgetSlot {
  type: WidgetType;
  preset: string;
  /** Only the options changed from their default. */
  options?: WidgetOptions;
}

export const presetOf = (slot: Pick<WidgetSlot, "type" | "preset">) =>
  WIDGETS[slot.type].presets.find((p) => p.id === slot.preset) ??
  WIDGETS[slot.type].presets[0];

/** Every option of a section, defaults filled in. */
export function optionsOf(slot: Pick<WidgetSlot, "type" | "options">) {
  const out: WidgetOptions = {};
  for (const def of WIDGETS[slot.type].options) {
    out[def.key] = slot.options?.[def.key] ?? def.default;
  }
  return out;
}

const slot = (type: WidgetType, preset?: string): WidgetSlot => ({
  type,
  preset: preset ?? WIDGETS[type].presets[0].id,
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

export const LayoutInput = z.array(
  z.object({
    type: z.string(),
    preset: z.string().optional(),
    // Layouts saved before presets carried a free size.
    w: z.number().finite().optional(),
    h: z.number().finite().optional(),
    options: z.record(z.unknown()).optional(),
  })
);

/** The preset closest to a free size (layouts saved before presets). */
function nearestPreset(type: WidgetType, w = 0, h = 0) {
  return [...WIDGETS[type].presets].sort(
    (a, b) =>
      Math.abs(a.w - w) +
      Math.abs(a.h - h) -
      (Math.abs(b.w - w) + Math.abs(b.h - h))
  )[0].id;
}

function cleanOptions(type: WidgetType, raw?: Record<string, unknown>) {
  if (!raw) return undefined;
  const out: WidgetOptions = {};
  for (const def of WIDGETS[type].options) {
    const v = raw[def.key];
    if (v === undefined) continue;
    if (def.kind === "bool" && typeof v === "boolean") out[def.key] = v;
    if (
      def.kind === "choice" &&
      typeof v === "string" &&
      def.choices.some((c) => c.value === v)
    )
      out[def.key] = v;
    if (def.kind === "links" && Array.isArray(v)) {
      out[def.key] = v
        .map((l) => CustomLinkInput.safeParse(l))
        .filter((r) => r.success)
        .map((r) => r.data as CustomLink)
        .slice(0, MAX_CUSTOM_LINKS);
    }
    if (def.kind === "multi" && Array.isArray(v)) {
      out[def.key] = def.choices
        .map((c) => c.value)
        .filter((c) => v.includes(c));
    }
  }
  return Object.keys(out).length ? out : undefined;
}

/** Keep known sections, once each, in a known format. */
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
    const preset = WIDGETS[type].presets.some((p) => p.id === s.preset)
      ? (s.preset as string)
      : nearestPreset(type, s.w, s.h);
    const options = cleanOptions(type, s.options);
    out.push(options ? { type, preset, options } : { type, preset });
  }
  return out;
}
