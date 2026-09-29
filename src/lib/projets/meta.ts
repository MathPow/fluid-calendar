/**
 * Shared vocabulary for the Projets and Contacts tabs — link kinds, the client
 * colour palette, station labels, and small helpers. Safe to import from both
 * server and client code (no Prisma here).
 */

export const LINK_KINDS = [
  { id: "figma", label: "Figma" },
  { id: "drive", label: "Drive" },
  { id: "website", label: "Site web" },
  { id: "claude", label: "Projet Claude" },
  { id: "github", label: "GitHub" },
  { id: "trello", label: "Trello" },
  { id: "notion", label: "Notion" },
  { id: "coolify", label: "Coolify" },
  { id: "other", label: "Autre" },
] as const;

export type LinkKind = (typeof LINK_KINDS)[number]["id"];
export const LINK_KIND_IDS = LINK_KINDS.map((k) => k.id) as [
  LinkKind,
  ...LinkKind[],
];

export const linkKindLabel = (kind: string) =>
  LINK_KINDS.find((k) => k.id === kind)?.label ?? "Lien";

/** What an organisation is to you. Drives the Perso / Client station filter. */
export const ORG_KINDS = [
  {
    id: "owned",
    label: "Mon entreprise",
    hint: "La mienne, ou j'y ai des parts",
    station: "work",
  },
  {
    id: "client",
    label: "Client",
    hint: "Je travaille pour eux",
    station: "work",
  },
  {
    id: "perso",
    label: "Perso",
    hint: "Projets personnels",
    station: "personal",
  },
] as const;

export type OrgKind = (typeof ORG_KINDS)[number]["id"];
export const ORG_KIND_IDS = ORG_KINDS.map((k) => k.id) as [
  OrgKind,
  ...OrgKind[],
];

export const orgKindLabel = (kind: string | null | undefined) =>
  ORG_KINDS.find((k) => k.id === kind)?.label ?? "Client";

export const orgKindStation = (
  kind: string | null | undefined
): ProjectStation => ORG_KINDS.find((k) => k.id === kind)?.station ?? "work";

/** A contact is a person or a company. */
export const CONTACT_TYPES = [
  { id: "person", label: "Personne" },
  { id: "company", label: "Entreprise" },
] as const;
export type ContactType = (typeof CONTACT_TYPES)[number]["id"];

/** How you know a contact. The precise wording lives in `relationDetail`. */
export const RELATION_KINDS = [
  { id: "ami", label: "Ami" },
  { id: "famille", label: "Famille" },
  { id: "collegue", label: "Collègue" },
  { id: "ecole", label: "École" },
  { id: "client", label: "Client" },
  { id: "partenaire", label: "Partenaire" },
  { id: "mentor", label: "Mentor" },
  { id: "connaissance", label: "Connaissance" },
  { id: "autre", label: "Autre" },
] as const;

export type RelationKind = (typeof RELATION_KINDS)[number]["id"];
export const RELATION_KIND_IDS = RELATION_KINDS.map((k) => k.id) as [
  RelationKind,
  ...RelationKind[],
];

export const relationLabel = (kind: string | null | undefined) =>
  RELATION_KINDS.find((k) => k.id === kind)?.label ?? kind ?? "";

/** Accepts a resized data URL or an https image link, nothing else. */
export const isAllowedImage = (v: string) =>
  /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(v) ||
  /^https:\/\/\S+$/.test(v);

/** The eight client tints from the design file. A colour never means a status. */
export const PROJECT_COLORS = [
  { hex: "#a8ccff", name: "Bleu" },
  { hex: "#ff7585", name: "Corail" },
  { hex: "#ffd166", name: "Ambre" },
  { hex: "#9fe0c4", name: "Menthe" },
  { hex: "#cbb2f0", name: "Lilas" },
  { hex: "#ffa8c5", name: "Rose" },
  { hex: "#bfd3a8", name: "Sauge" },
  { hex: "#9fd5f0", name: "Ciel" },
] as const;

export const DEFAULT_PROJECT_COLOR = PROJECT_COLORS[0].hex;

export const isHexColor = (v: string) => /^#[0-9a-f]{6}$/i.test(v);

/**
 * Ink or white, whichever reads better on `hex` (WCAG contrast). Custom brand
 * colours can be dark, where the usual ink initials would disappear.
 */
export function readableTextOn(hex: string | null | undefined): string {
  if (!hex || !isHexColor(hex)) return "#19181c";
  const channel = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const l = 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
  const ink = 0.0103; // relative luminance of #19181c
  const onInk = (l + 0.05) / (ink + 0.05);
  const onWhite = 1.05 / (l + 0.05);
  return onInk >= onWhite ? "#19181c" : "#ffffff";
}

export type ProjectStation = "personal" | "work";

export const PROJECT_STATIONS: { id: ProjectStation; label: string }[] = [
  { id: "personal", label: "Perso" },
  { id: "work", label: "Client" },
];

export const stationLabel = (station: string) =>
  PROJECT_STATIONS.find((s) => s.id === station)?.label ?? station;

/** "dehors-shop" from "Dehors · Shop"; accents stripped, lowercase, dashes. */
export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** Best guess of the link kind from its host, e.g. figma.com → "figma". */
export function guessLinkKind(url: string): LinkKind | null {
  let host = "";
  try {
    host = new URL(normalizeUrl(url)).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (host.includes("figma.com")) return "figma";
  if (host.includes("drive.google.com") || host.includes("docs.google.com"))
    return "drive";
  if (host.includes("claude.ai")) return "claude";
  if (host.includes("github.com")) return "github";
  if (host.includes("trello.com")) return "trello";
  if (host.includes("notion.so") || host.includes("notion.site"))
    return "notion";
  if (host.includes("coolify")) return "coolify";
  return null;
}

/**
 * Address that opens a project's folder in a machine's web terminal (ttyd):
 * the machine's base URL plus `?project=<folder name>`.
 */
export function terminalUrl(
  ttydUrl: string | null | undefined,
  path: string
): string | null {
  if (!ttydUrl) return null;
  const folder = path.split("/").filter(Boolean).pop();
  if (!folder) return null;
  const base = ttydUrl.trim().replace(/[?#].*$/, "");
  return `${base}${base.endsWith("/") ? "" : "/"}?project=${encodeURIComponent(folder)}`;
}

/** Prepend https:// when the user typed a bare domain. */
export function normalizeUrl(input: string): string {
  const v = input.trim();
  if (!v) return v;
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(v) ? v : `https://${v}`;
}

export function timeAgoFr(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (s < 60) return "à l'instant";
  const m = Math.floor(s / 60);
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `il y a ${d} j`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `il y a ${mo} mois`;
  return `il y a ${Math.floor(mo / 12)} an${mo >= 24 ? "s" : ""}`;
}

export const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "?";

export const pad2 = (n: number) => String(n).padStart(2, "0");
