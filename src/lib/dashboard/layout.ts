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
] as const;
export type WidgetType = (typeof WIDGET_TYPES)[number];

/** Grid columns on a wide screen; rows are a fixed height (see BentoGrid). */
export const GRID_COLS = 4;

/**
 * A designed format: a size plus the layout the section uses at that size.
 * Sections only come in these, so each one always looks composed.
 * The user-visible label is resolved from i18n via the `presetLabel` helper.
 */
export interface Preset {
  id: string;
  w: number;
  h: number;
}

export type OptionDef =
  | { key: string; kind: "bool"; default: boolean }
  | {
      key: string;
      kind: "choice";
      choices: { value: string }[];
      default: string;
    }
  | {
      key: string;
      kind: "multi";
      choices: { value: string }[];
      default: string[];
    }
  | { key: string; kind: "links"; default: CustomLink[] };

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

const count = (values: number[]) => values.map((v) => ({ value: String(v) }));

/**
 * Widget metadata lives here as pure data; user-visible labels are resolved
 * through the `widgetTitle`, `presetLabel`, `optionLabel`, `choiceLabel`
 * helpers in BentoGrid (keys `dashboard.widgets.<type>.*`).
 */
export const WIDGETS: Record<WidgetType, WidgetMeta> = {
  "next-up": {
    presets: [
      { id: "hero", w: 3, h: 2 },
      { id: "strip", w: 4, h: 1 },
      { id: "square", w: 2, h: 2 },
      { id: "compact", w: 1, h: 2 },
    ],
    options: [
      { key: "location", kind: "bool", default: true },
      { key: "after", kind: "choice", choices: count([0, 2, 3]), default: "0" },
    ],
  },
  today: {
    presets: [
      { id: "tile", w: 1, h: 2 },
      { id: "mini", w: 1, h: 1 },
      { id: "wide", w: 2, h: 2 },
    ],
    options: [
      { key: "week", kind: "bool", default: true },
      { key: "due", kind: "bool", default: true },
    ],
  },
  month: {
    presets: [
      { id: "compact", w: 1, h: 3 },
      { id: "split", w: 2, h: 3 },
      { id: "large", w: 4, h: 3 },
    ],
    options: [
      { key: "tasks", kind: "bool", default: true },
      {
        key: "weekStart",
        kind: "choice",
        choices: [{ value: "auto" }, { value: "monday" }, { value: "sunday" }],
        default: "auto",
      },
    ],
  },
  shortcuts: {
    presets: [
      { id: "row", w: 4, h: 1 },
      { id: "half", w: 2, h: 1 },
      { id: "pad", w: 2, h: 2 },
      { id: "column", w: 1, h: 3 },
    ],
    options: [
      { key: "machine", kind: "bool", default: true },
      { key: "add", kind: "bool", default: true },
    ],
  },
  news: {
    presets: [
      { id: "wide", w: 4, h: 3 },
      { id: "strip", w: 4, h: 2 },
      { id: "half", w: 2, h: 3 },
      { id: "column", w: 1, h: 3 },
    ],
    options: [{ key: "unreadOnly", kind: "bool", default: false }],
  },
  tasks: {
    presets: [
      { id: "column", w: 1, h: 4 },
      { id: "list", w: 2, h: 3 },
      { id: "wide", w: 4, h: 2 },
      { id: "compact", w: 1, h: 2 },
    ],
    options: [
      {
        key: "filter",
        kind: "choice",
        choices: [{ value: "all" }, { value: "soon" }, { value: "active" }],
        default: "all",
      },
      {
        key: "limit",
        kind: "choice",
        choices: [...count([5, 10, 20]), { value: "all" }],
        default: "10",
      },
      { key: "due", kind: "bool", default: true },
    ],
  },
  dossier: {
    presets: [
      { id: "standard", w: 3, h: 4 },
      { id: "wide", w: 4, h: 3 },
      { id: "half", w: 2, h: 4 },
    ],
    options: [
      {
        key: "tab",
        kind: "choice",
        choices: [
          { value: "schedule" },
          { value: "projects" },
          { value: "recent" },
        ],
        default: "schedule",
      },
    ],
  },
  schedule: {
    presets: [
      { id: "list", w: 2, h: 3 },
      { id: "column", w: 1, h: 3 },
      { id: "wide", w: 4, h: 2 },
    ],
    options: [
      {
        key: "range",
        kind: "choice",
        choices: [{ value: "today" }, { value: "3d" }, { value: "week" }],
        default: "today",
      },
      { key: "calendar", kind: "bool", default: true },
    ],
  },
  projects: {
    presets: [
      { id: "list", w: 2, h: 3 },
      { id: "wide", w: 4, h: 3 },
      { id: "column", w: 1, h: 3 },
    ],
    options: [
      {
        key: "top",
        kind: "choice",
        choices: count([2, 4, 6]),
        default: "4",
      },
      { key: "description", kind: "bool", default: true },
    ],
  },
  recent: {
    presets: [
      { id: "list", w: 2, h: 3 },
      { id: "column", w: 1, h: 3 },
      { id: "wide", w: 4, h: 2 },
    ],
    options: [
      {
        key: "kind",
        kind: "choice",
        choices: [{ value: "all" }, { value: "note" }, { value: "recording" }],
        default: "all",
      },
    ],
  },
  machines: {
    presets: [
      { id: "strip", w: 4, h: 1 },
      { id: "half", w: 2, h: 1 },
      { id: "list", w: 1, h: 2 },
      { id: "grid", w: 2, h: 2 },
    ],
    options: [{ key: "unmonitored", kind: "bool", default: true }],
  },
  "quick-links": {
    presets: [
      { id: "row", w: 4, h: 1 },
      { id: "icons", w: 2, h: 1 },
      { id: "grid", w: 2, h: 2 },
      { id: "column", w: 1, h: 3 },
    ],
    options: [
      {
        key: "links",
        kind: "multi",
        choices: QUICK_LINK_IDS.map((id) => ({ value: id })),
        default: [...QUICK_LINK_IDS],
      },
      { key: "custom", kind: "links", default: [] },
    ],
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
