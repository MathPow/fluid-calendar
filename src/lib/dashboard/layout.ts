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
  /** i18n key for `label` (parallel field so consumers can look it up). */
  labelKey?: string;
  w: number;
  h: number;
}

export type OptionChoice = {
  value: string;
  label: string;
  /** i18n key for `label`. */
  labelKey?: string;
};

export type OptionDef =
  | {
      key: string;
      label: string;
      labelKey?: string;
      kind: "bool";
      default: boolean;
    }
  | {
      key: string;
      label: string;
      labelKey?: string;
      kind: "choice";
      choices: OptionChoice[];
      default: string;
    }
  | {
      key: string;
      label: string;
      labelKey?: string;
      kind: "multi";
      choices: OptionChoice[];
      default: string[];
    }
  | {
      key: string;
      label: string;
      labelKey?: string;
      kind: "links";
      default: CustomLink[];
    };

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
  /** i18n key for `title`. */
  titleKey?: string;
  description: string;
  /** i18n key for `description`. */
  descriptionKey?: string;
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

/** Default French labels for the built-in quick links. */
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

/** Parallel i18n keys for `QUICK_LINK_LABELS`. */
export const QUICK_LINK_LABEL_KEYS: Record<
  (typeof QUICK_LINK_IDS)[number],
  string
> = {
  calendar: "dashboard.quickLinks.calendar",
  tasks: "dashboard.quickLinks.tasks",
  focus: "dashboard.quickLinks.focus",
  email: "dashboard.quickLinks.email",
  notes: "dashboard.quickLinks.notes",
  projets: "dashboard.quickLinks.projets",
  contacts: "dashboard.quickLinks.contacts",
  machines: "dashboard.quickLinks.machines",
  fiscalite: "dashboard.quickLinks.fiscalite",
  settings: "dashboard.quickLinks.settings",
};

const count = (values: number[], keyPrefix: string) =>
  values.map((v) => ({
    value: String(v),
    label: String(v),
    labelKey: `${keyPrefix}.${v}`,
  }));

export const WIDGETS: Record<WidgetType, WidgetMeta> = {
  "next-up": {
    title: "Prochain événement",
    titleKey: "dashboard.widgets.next-up.title",
    description: "Le prochain rendez-vous au calendrier.",
    descriptionKey: "dashboard.widgets.next-up.description",
    presets: [
      {
        id: "hero",
        label: "Bannière",
        labelKey: "dashboard.widgets.next-up.preset.hero",
        w: 3,
        h: 2,
      },
      {
        id: "strip",
        label: "Bandeau",
        labelKey: "dashboard.widgets.next-up.preset.strip",
        w: 4,
        h: 1,
      },
      {
        id: "square",
        label: "Carré",
        labelKey: "dashboard.widgets.next-up.preset.square",
        w: 2,
        h: 2,
      },
      {
        id: "compact",
        label: "Compact",
        labelKey: "dashboard.widgets.next-up.preset.compact",
        w: 1,
        h: 2,
      },
    ],
    options: [
      {
        key: "location",
        label: "Lieu et calendrier",
        labelKey: "dashboard.widgets.next-up.option.location",
        kind: "bool",
        default: true,
      },
      {
        key: "after",
        label: "Événements suivants",
        labelKey: "dashboard.widgets.next-up.option.after",
        kind: "choice",
        choices: count([0, 2, 3], "dashboard.widgets.next-up.choice.after"),
        default: "0",
      },
    ],
  },
  today: {
    title: "Aujourd'hui",
    titleKey: "dashboard.widgets.today.title",
    description: "La date, la semaine et les tâches du jour.",
    descriptionKey: "dashboard.widgets.today.description",
    presets: [
      {
        id: "tile",
        label: "Tuile",
        labelKey: "dashboard.widgets.today.preset.tile",
        w: 1,
        h: 2,
      },
      {
        id: "mini",
        label: "Mini",
        labelKey: "dashboard.widgets.today.preset.mini",
        w: 1,
        h: 1,
      },
      {
        id: "wide",
        label: "Large",
        labelKey: "dashboard.widgets.today.preset.wide",
        w: 2,
        h: 2,
      },
    ],
    options: [
      {
        key: "week",
        label: "Numéro de semaine",
        labelKey: "dashboard.widgets.today.option.week",
        kind: "bool",
        default: true,
      },
      {
        key: "due",
        label: "Tâches dues",
        labelKey: "dashboard.widgets.today.option.due",
        kind: "bool",
        default: true,
      },
    ],
  },
  month: {
    title: "Mois",
    titleKey: "dashboard.widgets.month.title",
    description: "Le mois en grille, un point sur chaque jour chargé.",
    descriptionKey: "dashboard.widgets.month.description",
    presets: [
      {
        id: "compact",
        label: "Compact",
        labelKey: "dashboard.widgets.month.preset.compact",
        w: 1,
        h: 3,
      },
      {
        id: "split",
        label: "Côte à côte",
        labelKey: "dashboard.widgets.month.preset.split",
        w: 2,
        h: 3,
      },
      {
        id: "large",
        label: "Grand",
        labelKey: "dashboard.widgets.month.preset.large",
        w: 4,
        h: 3,
      },
    ],
    options: [
      {
        key: "tasks",
        label: "Tâches dues",
        labelKey: "dashboard.widgets.month.option.tasks",
        kind: "bool",
        default: true,
      },
      {
        key: "weekStart",
        label: "La semaine commence",
        labelKey: "dashboard.widgets.month.option.weekStart",
        kind: "choice",
        choices: [
          {
            value: "auto",
            label: "Réglages",
            labelKey: "dashboard.widgets.month.choice.weekStart.auto",
          },
          {
            value: "monday",
            label: "Lundi",
            labelKey: "dashboard.widgets.month.choice.weekStart.monday",
          },
          {
            value: "sunday",
            label: "Dimanche",
            labelKey: "dashboard.widgets.month.choice.weekStart.sunday",
          },
        ],
        default: "auto",
      },
    ],
  },
  shortcuts: {
    title: "Raccourcis",
    titleKey: "dashboard.widgets.shortcuts.title",
    description: "Tes boutons de lancement, en un tap sur la machine.",
    descriptionKey: "dashboard.widgets.shortcuts.description",
    presets: [
      {
        id: "row",
        label: "Rangée",
        labelKey: "dashboard.widgets.shortcuts.preset.row",
        w: 4,
        h: 1,
      },
      {
        id: "half",
        label: "Demi",
        labelKey: "dashboard.widgets.shortcuts.preset.half",
        w: 2,
        h: 1,
      },
      {
        id: "pad",
        label: "Pavé",
        labelKey: "dashboard.widgets.shortcuts.preset.pad",
        w: 2,
        h: 2,
      },
      {
        id: "column",
        label: "Colonne",
        labelKey: "dashboard.widgets.shortcuts.preset.column",
        w: 1,
        h: 3,
      },
    ],
    options: [
      {
        key: "machine",
        label: "Nom de la machine",
        labelKey: "dashboard.widgets.shortcuts.option.machine",
        kind: "bool",
        default: true,
      },
      {
        key: "add",
        label: "Bouton « + »",
        labelKey: "dashboard.widgets.shortcuts.option.add",
        kind: "bool",
        default: true,
      },
    ],
  },
  news: {
    title: "Nouvelles",
    titleKey: "dashboard.widgets.news.title",
    description: "Les dernières notifications, non lues d'abord.",
    descriptionKey: "dashboard.widgets.news.description",
    presets: [
      {
        id: "wide",
        label: "Large",
        labelKey: "dashboard.widgets.news.preset.wide",
        w: 4,
        h: 3,
      },
      {
        id: "strip",
        label: "Bande",
        labelKey: "dashboard.widgets.news.preset.strip",
        w: 4,
        h: 2,
      },
      {
        id: "half",
        label: "Demi",
        labelKey: "dashboard.widgets.news.preset.half",
        w: 2,
        h: 3,
      },
      {
        id: "column",
        label: "Colonne",
        labelKey: "dashboard.widgets.news.preset.column",
        w: 1,
        h: 3,
      },
    ],
    options: [
      {
        key: "unreadOnly",
        label: "Non lues seulement",
        labelKey: "dashboard.widgets.news.option.unreadOnly",
        kind: "bool",
        default: false,
      },
    ],
  },
  tasks: {
    title: "Tâches ouvertes",
    titleKey: "dashboard.widgets.tasks.title",
    description: "Les tâches à faire, la plus urgente d'abord.",
    descriptionKey: "dashboard.widgets.tasks.description",
    presets: [
      {
        id: "column",
        label: "Colonne",
        labelKey: "dashboard.widgets.tasks.preset.column",
        w: 1,
        h: 4,
      },
      {
        id: "list",
        label: "Liste",
        labelKey: "dashboard.widgets.tasks.preset.list",
        w: 2,
        h: 3,
      },
      {
        id: "wide",
        label: "Deux colonnes",
        labelKey: "dashboard.widgets.tasks.preset.wide",
        w: 4,
        h: 2,
      },
      {
        id: "compact",
        label: "Compact",
        labelKey: "dashboard.widgets.tasks.preset.compact",
        w: 1,
        h: 2,
      },
    ],
    options: [
      {
        key: "filter",
        label: "Afficher",
        labelKey: "dashboard.widgets.tasks.option.filter",
        kind: "choice",
        choices: [
          {
            value: "all",
            label: "Toutes",
            labelKey: "dashboard.widgets.tasks.choice.filter.all",
          },
          {
            value: "soon",
            label: "Dues ≤ 7 j",
            labelKey: "dashboard.widgets.tasks.choice.filter.soon",
          },
          {
            value: "active",
            label: "En cours",
            labelKey: "dashboard.widgets.tasks.choice.filter.active",
          },
        ],
        default: "all",
      },
      {
        key: "limit",
        label: "Nombre",
        labelKey: "dashboard.widgets.tasks.option.limit",
        kind: "choice",
        choices: [
          ...count([5, 10, 20], "dashboard.widgets.tasks.choice.limit"),
          {
            value: "all",
            label: "Tout",
            labelKey: "dashboard.widgets.tasks.choice.limit.all",
          },
        ],
        default: "10",
      },
      {
        key: "due",
        label: "Échéances",
        labelKey: "dashboard.widgets.tasks.option.due",
        kind: "bool",
        default: true,
      },
    ],
  },
  dossier: {
    title: "Dossier",
    titleKey: "dashboard.widgets.dossier.title",
    description: "Horaire, projets et récents dans un seul bloc à onglets.",
    descriptionKey: "dashboard.widgets.dossier.description",
    presets: [
      {
        id: "standard",
        label: "Standard",
        labelKey: "dashboard.widgets.dossier.preset.standard",
        w: 3,
        h: 4,
      },
      {
        id: "wide",
        label: "Large",
        labelKey: "dashboard.widgets.dossier.preset.wide",
        w: 4,
        h: 3,
      },
      {
        id: "half",
        label: "Demi",
        labelKey: "dashboard.widgets.dossier.preset.half",
        w: 2,
        h: 4,
      },
    ],
    options: [
      {
        key: "tab",
        label: "Onglet de départ",
        labelKey: "dashboard.widgets.dossier.option.tab",
        kind: "choice",
        choices: [
          {
            value: "schedule",
            label: "Horaire",
            labelKey: "dashboard.widgets.dossier.choice.tab.schedule",
          },
          {
            value: "projects",
            label: "Projets",
            labelKey: "dashboard.widgets.dossier.choice.tab.projects",
          },
          {
            value: "recent",
            label: "Récents",
            labelKey: "dashboard.widgets.dossier.choice.tab.recent",
          },
        ],
        default: "schedule",
      },
    ],
  },
  schedule: {
    title: "Horaire",
    titleKey: "dashboard.widgets.schedule.title",
    description: "Les événements à venir, dans l'ordre.",
    descriptionKey: "dashboard.widgets.schedule.description",
    presets: [
      {
        id: "list",
        label: "Liste",
        labelKey: "dashboard.widgets.schedule.preset.list",
        w: 2,
        h: 3,
      },
      {
        id: "column",
        label: "Colonne",
        labelKey: "dashboard.widgets.schedule.preset.column",
        w: 1,
        h: 3,
      },
      {
        id: "wide",
        label: "Large",
        labelKey: "dashboard.widgets.schedule.preset.wide",
        w: 4,
        h: 2,
      },
    ],
    options: [
      {
        key: "range",
        label: "Période",
        labelKey: "dashboard.widgets.schedule.option.range",
        kind: "choice",
        choices: [
          {
            value: "today",
            label: "Aujourd'hui",
            labelKey: "dashboard.widgets.schedule.choice.range.today",
          },
          {
            value: "3d",
            label: "3 jours",
            labelKey: "dashboard.widgets.schedule.choice.range.3d",
          },
          {
            value: "week",
            label: "7 jours",
            labelKey: "dashboard.widgets.schedule.choice.range.week",
          },
        ],
        default: "today",
      },
      {
        key: "calendar",
        label: "Nom du calendrier",
        labelKey: "dashboard.widgets.schedule.option.calendar",
        kind: "bool",
        default: true,
      },
    ],
  },
  projects: {
    title: "Projets",
    titleKey: "dashboard.widgets.projects.title",
    description: "Tes projets par organisation, avec leur terminal.",
    descriptionKey: "dashboard.widgets.projects.description",
    presets: [
      {
        id: "list",
        label: "Liste",
        labelKey: "dashboard.widgets.projects.preset.list",
        w: 2,
        h: 3,
      },
      {
        id: "wide",
        label: "Colonnes",
        labelKey: "dashboard.widgets.projects.preset.wide",
        w: 4,
        h: 3,
      },
      {
        id: "column",
        label: "Colonne",
        labelKey: "dashboard.widgets.projects.preset.column",
        w: 1,
        h: 3,
      },
    ],
    options: [
      {
        key: "top",
        label: "Projets par organisation",
        labelKey: "dashboard.widgets.projects.option.top",
        kind: "choice",
        choices: count([2, 4, 6], "dashboard.widgets.projects.choice.top"),
        default: "4",
      },
      {
        key: "description",
        label: "Descriptions",
        labelKey: "dashboard.widgets.projects.option.description",
        kind: "bool",
        default: true,
      },
    ],
  },
  recent: {
    title: "Récents",
    titleKey: "dashboard.widgets.recent.title",
    description: "Notes modifiées et enregistrements synchronisés.",
    descriptionKey: "dashboard.widgets.recent.description",
    presets: [
      {
        id: "list",
        label: "Liste",
        labelKey: "dashboard.widgets.recent.preset.list",
        w: 2,
        h: 3,
      },
      {
        id: "column",
        label: "Colonne",
        labelKey: "dashboard.widgets.recent.preset.column",
        w: 1,
        h: 3,
      },
      {
        id: "wide",
        label: "Deux colonnes",
        labelKey: "dashboard.widgets.recent.preset.wide",
        w: 4,
        h: 2,
      },
    ],
    options: [
      {
        key: "kind",
        label: "Afficher",
        labelKey: "dashboard.widgets.recent.option.kind",
        kind: "choice",
        choices: [
          {
            value: "all",
            label: "Tout",
            labelKey: "dashboard.widgets.recent.choice.kind.all",
          },
          {
            value: "note",
            label: "Notes",
            labelKey: "dashboard.widgets.recent.choice.kind.note",
          },
          {
            value: "recording",
            label: "Enregistr.",
            labelKey: "dashboard.widgets.recent.choice.kind.recording",
          },
        ],
        default: "all",
      },
    ],
  },
  machines: {
    title: "Machines",
    titleKey: "dashboard.widgets.machines.title",
    description: "Un point par machine : vert, jaune ou rouge.",
    descriptionKey: "dashboard.widgets.machines.description",
    presets: [
      {
        id: "strip",
        label: "Bandeau",
        labelKey: "dashboard.widgets.machines.preset.strip",
        w: 4,
        h: 1,
      },
      {
        id: "half",
        label: "Demi",
        labelKey: "dashboard.widgets.machines.preset.half",
        w: 2,
        h: 1,
      },
      {
        id: "list",
        label: "Liste",
        labelKey: "dashboard.widgets.machines.preset.list",
        w: 1,
        h: 2,
      },
      {
        id: "grid",
        label: "Grille",
        labelKey: "dashboard.widgets.machines.preset.grid",
        w: 2,
        h: 2,
      },
    ],
    options: [
      {
        key: "unmonitored",
        label: "Machines non surveillées",
        labelKey: "dashboard.widgets.machines.option.unmonitored",
        kind: "bool",
        default: true,
      },
    ],
  },
  "quick-links": {
    title: "Accès rapide",
    titleKey: "dashboard.widgets.quick-links.title",
    description: "Des boutons vers les autres onglets de DreamDash.",
    descriptionKey: "dashboard.widgets.quick-links.description",
    presets: [
      {
        id: "row",
        label: "Rangée",
        labelKey: "dashboard.widgets.quick-links.preset.row",
        w: 4,
        h: 1,
      },
      {
        id: "icons",
        label: "Icônes",
        labelKey: "dashboard.widgets.quick-links.preset.icons",
        w: 2,
        h: 1,
      },
      {
        id: "grid",
        label: "Grille",
        labelKey: "dashboard.widgets.quick-links.preset.grid",
        w: 2,
        h: 2,
      },
      {
        id: "column",
        label: "Colonne",
        labelKey: "dashboard.widgets.quick-links.preset.column",
        w: 1,
        h: 3,
      },
    ],
    options: [
      {
        key: "links",
        label: "Onglets",
        labelKey: "dashboard.widgets.quick-links.option.links",
        kind: "multi",
        choices: QUICK_LINK_IDS.map((id) => ({
          value: id,
          label: QUICK_LINK_LABELS[id],
          labelKey: QUICK_LINK_LABEL_KEYS[id],
        })),
        default: [...QUICK_LINK_IDS],
      },
      {
        key: "custom",
        label: "Mes liens",
        labelKey: "dashboard.widgets.quick-links.option.custom",
        kind: "links",
        default: [],
      },
    ],
  },
  sticky: {
    title: "Pense-bête",
    titleKey: "dashboard.widgets.sticky.title",
    description:
      "Des petites notes rapides, gardées dans Notes ▸ Pense-bête, colorées par organisation.",
    descriptionKey: "dashboard.widgets.sticky.description",
    presets: [
      {
        id: "board",
        label: "Tableau",
        labelKey: "dashboard.widgets.sticky.preset.board",
        w: 2,
        h: 3,
      },
      {
        id: "column",
        label: "Colonne",
        labelKey: "dashboard.widgets.sticky.preset.column",
        w: 1,
        h: 3,
      },
      {
        id: "wide",
        label: "Large",
        labelKey: "dashboard.widgets.sticky.preset.wide",
        w: 4,
        h: 2,
      },
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
