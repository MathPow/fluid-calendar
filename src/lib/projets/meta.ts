/**
 * Shared vocabulary for the Projets and Contacts tabs — link kinds, the client
 * colour palette, station labels, and small helpers. Safe to import from both
 * server and client code (no Prisma here).
 */

import { tNow } from "@/i18n/now";

export const LINK_KINDS = [
  { id: "figma", label: "Figma", labelKey: "projets.linkKind.figma" },
  { id: "drive", label: "Drive", labelKey: "projets.linkKind.drive" },
  { id: "website", label: "Site web", labelKey: "projets.linkKind.website" },
  { id: "claude", label: "Projet Claude", labelKey: "projets.linkKind.claude" },
  { id: "github", label: "GitHub", labelKey: "projets.linkKind.github" },
  { id: "trello", label: "Trello", labelKey: "projets.linkKind.trello" },
  { id: "notion", label: "Notion", labelKey: "projets.linkKind.notion" },
  { id: "coolify", label: "Coolify", labelKey: "projets.linkKind.coolify" },
  { id: "other", label: "Autre", labelKey: "projets.linkKind.other" },
] as const;

export type LinkKind = (typeof LINK_KINDS)[number]["id"];
export const LINK_KIND_IDS = LINK_KINDS.map((k) => k.id) as [
  LinkKind,
  ...LinkKind[],
];

export const linkKindLabel = (kind: string) => {
  const k = LINK_KINDS.find((k) => k.id === kind);
  if (!k) return tNow("projets.linkKind.fallback");
  return tNow(k.labelKey) || k.label;
};

/** What an organisation is to you. Drives the Perso / Client station filter. */
export const ORG_KINDS = [
  {
    id: "owned",
    label: "Mon entreprise",
    labelKey: "projets.orgKind.owned",
    hint: "La mienne, ou j'y ai des parts",
    hintKey: "projets.orgKind.ownedHint",
    station: "work",
  },
  {
    id: "client",
    label: "Client",
    labelKey: "projets.orgKind.client",
    hint: "Je travaille pour eux",
    hintKey: "projets.orgKind.clientHint",
    station: "work",
  },
  {
    id: "perso",
    label: "Perso",
    labelKey: "projets.orgKind.perso",
    hint: "Projets personnels",
    hintKey: "projets.orgKind.persoHint",
    station: "personal",
  },
] as const;

export type OrgKind = (typeof ORG_KINDS)[number]["id"];
export const ORG_KIND_IDS = ORG_KINDS.map((k) => k.id) as [
  OrgKind,
  ...OrgKind[],
];

export const orgKindLabel = (kind: string | null | undefined) => {
  const k = ORG_KINDS.find((k) => k.id === kind);
  if (!k) return tNow("projets.orgKind.client");
  return tNow(k.labelKey) || k.label;
};

export const orgKindStation = (
  kind: string | null | undefined
): ProjectStation => ORG_KINDS.find((k) => k.id === kind)?.station ?? "work";

/** A contact is a person or a company. */
export const CONTACT_TYPES = [
  { id: "person", label: "Personne", labelKey: "projets.contactType.person" },
  { id: "company", label: "Entreprise", labelKey: "projets.contactType.company" },
] as const;
export type ContactType = (typeof CONTACT_TYPES)[number]["id"];

/** How you know a contact. The precise wording lives in `relationDetail`. */
export const RELATION_KINDS = [
  { id: "ami", label: "Ami", labelKey: "projets.relationKind.ami" },
  { id: "famille", label: "Famille", labelKey: "projets.relationKind.famille" },
  { id: "collegue", label: "Collègue", labelKey: "projets.relationKind.collegue" },
  { id: "ecole", label: "École", labelKey: "projets.relationKind.ecole" },
  { id: "client", label: "Client", labelKey: "projets.relationKind.client" },
  { id: "partenaire", label: "Partenaire", labelKey: "projets.relationKind.partenaire" },
  { id: "fournisseur", label: "Fournisseur", labelKey: "projets.relationKind.fournisseur" },
  { id: "mentor", label: "Mentor", labelKey: "projets.relationKind.mentor" },
  { id: "connaissance", label: "Connaissance", labelKey: "projets.relationKind.connaissance" },
  { id: "autre", label: "Autre", labelKey: "projets.relationKind.autre" },
] as const;

export type RelationKind = (typeof RELATION_KINDS)[number]["id"];
export const RELATION_KIND_IDS = RELATION_KINDS.map((k) => k.id) as [
  RelationKind,
  ...RelationKind[],
];

export const relationLabel = (kind: string | null | undefined) => {
  const k = RELATION_KINDS.find((k) => k.id === kind);
  if (!k) return kind ?? "";
  return tNow(k.labelKey) || k.label;
};

/** Common categories for a person's `role` field. Free text is still allowed. */
export const PERSON_ROLE_SUGGESTIONS = [
  { label: "Entrepreneur", labelKey: "projets.personRole.entrepreneur" },
  { label: "Professionnel", labelKey: "projets.personRole.professionnel" },
  { label: "Freelance", labelKey: "projets.personRole.freelance" },
  { label: "Étudiant", labelKey: "projets.personRole.etudiant" },
  { label: "Consultant", labelKey: "projets.personRole.consultant" },
  { label: "Développeur", labelKey: "projets.personRole.developpeur" },
  { label: "Designer", labelKey: "projets.personRole.designer" },
  { label: "Photographe", labelKey: "projets.personRole.photographe" },
  { label: "Vidéaste", labelKey: "projets.personRole.videaste" },
  { label: "Artiste", labelKey: "projets.personRole.artiste" },
  { label: "Journaliste", labelKey: "projets.personRole.journaliste" },
  { label: "Enseignant", labelKey: "projets.personRole.enseignant" },
  { label: "Chercheur", labelKey: "projets.personRole.chercheur" },
  { label: "Médecin", labelKey: "projets.personRole.medecin" },
  { label: "Avocat", labelKey: "projets.personRole.avocat" },
  { label: "Notaire", labelKey: "projets.personRole.notaire" },
  { label: "Comptable", labelKey: "projets.personRole.comptable" },
  { label: "Ingénieur", labelKey: "projets.personRole.ingenieur" },
  { label: "Architecte", labelKey: "projets.personRole.architecte" },
  { label: "Commerçant", labelKey: "projets.personRole.commercant" },
  { label: "Investisseur", labelKey: "projets.personRole.investisseur" },
  { label: "Artisan", labelKey: "projets.personRole.artisan" },
  { label: "Retraité", labelKey: "projets.personRole.retraite" },
  { label: "Autre", labelKey: "projets.personRole.autre" },
] as const;

/** Common sectors for a company's `role` field. Free text is still allowed. */
export const COMPANY_ROLE_SUGGESTIONS = [
  { label: "Tech", labelKey: "projets.companyRole.tech" },
  { label: "Événementiel", labelKey: "projets.companyRole.evenementiel" },
  { label: "Immobilier", labelKey: "projets.companyRole.immobilier" },
  { label: "Restauration", labelKey: "projets.companyRole.restauration" },
  { label: "Commerce", labelKey: "projets.companyRole.commerce" },
  { label: "Construction", labelKey: "projets.companyRole.construction" },
  { label: "Design", labelKey: "projets.companyRole.design" },
  { label: "Marketing", labelKey: "projets.companyRole.marketing" },
  { label: "Finance", labelKey: "projets.companyRole.finance" },
  { label: "Assurance", labelKey: "projets.companyRole.assurance" },
  { label: "Santé", labelKey: "projets.companyRole.sante" },
  { label: "Éducation", labelKey: "projets.companyRole.education" },
  { label: "Média", labelKey: "projets.companyRole.media" },
  { label: "Manufacture", labelKey: "projets.companyRole.manufacture" },
  { label: "Agriculture", labelKey: "projets.companyRole.agriculture" },
  { label: "Logistique", labelKey: "projets.companyRole.logistique" },
  { label: "Transport", labelKey: "projets.companyRole.transport" },
  { label: "Énergie", labelKey: "projets.companyRole.energie" },
  { label: "Sport", labelKey: "projets.companyRole.sport" },
  { label: "Culture", labelKey: "projets.companyRole.culture" },
  { label: "Tourisme", labelKey: "projets.companyRole.tourisme" },
  { label: "OBNL", labelKey: "projets.companyRole.obnl" },
  { label: "Autre", labelKey: "projets.companyRole.autre" },
] as const;

export const roleOptions = (kind: "person" | "company") => {
  const source =
    kind === "company" ? COMPANY_ROLE_SUGGESTIONS : PERSON_ROLE_SUGGESTIONS;
  return source.map((r) => {
    const translated = tNow(r.labelKey);
    const label = translated && translated !== r.labelKey ? translated : r.label;
    // `value` keeps the French label so already-stored contacts match.
    return { value: r.label, label };
  });
};

/** Accepts a resized data URL or an https image link, nothing else. */
export const isAllowedImage = (v: string) =>
  /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(v) ||
  /^https:\/\/\S+$/.test(v);

/** The eight client tints from the design file. A colour never means a status. */
export const PROJECT_COLORS = [
  { hex: "#a8ccff", name: "Bleu", nameKey: "projets.color.bleu" },
  { hex: "#ff7585", name: "Corail", nameKey: "projets.color.corail" },
  { hex: "#ffd166", name: "Ambre", nameKey: "projets.color.ambre" },
  { hex: "#9fe0c4", name: "Menthe", nameKey: "projets.color.menthe" },
  { hex: "#cbb2f0", name: "Lilas", nameKey: "projets.color.lilas" },
  { hex: "#ffa8c5", name: "Rose", nameKey: "projets.color.rose" },
  { hex: "#bfd3a8", name: "Sauge", nameKey: "projets.color.sauge" },
  { hex: "#9fd5f0", name: "Ciel", nameKey: "projets.color.ciel" },
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

export const PROJECT_STATIONS: {
  id: ProjectStation;
  label: string;
  labelKey: string;
}[] = [
  { id: "personal", label: "Perso", labelKey: "projets.station.personal" },
  { id: "work", label: "Client", labelKey: "projets.station.work" },
];

export const stationLabel = (station: string) => {
  const s = PROJECT_STATIONS.find((s) => s.id === station);
  if (!s) return station;
  return tNow(s.labelKey) || s.label;
};

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

/**
 * Short, locale-aware "how long ago" string. The old name `timeAgoFr` stays
 * so existing imports keep working; the output is now translated.
 */
export function timeAgoFr(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (s < 60) return tNow("projets.timeAgo.now");
  const m = Math.floor(s / 60);
  if (m < 60) return tNow("projets.timeAgo.minutes", { count: m });
  const h = Math.floor(m / 60);
  if (h < 24) return tNow("projets.timeAgo.hours", { count: h });
  const d = Math.floor(h / 24);
  if (d < 30) return tNow("projets.timeAgo.days", { count: d });
  const mo = Math.floor(d / 30);
  if (mo < 12) return tNow("projets.timeAgo.months", { count: mo });
  const y = Math.floor(mo / 12);
  return tNow(y === 1 ? "projets.timeAgo.year" : "projets.timeAgo.years", {
    count: y,
  });
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

/**
 * Platforms a contact can be linked on. `url` turns a handle into a link;
 * a full URL typed in the field is always kept as is.
 */
export const SOCIAL_PLATFORMS = [
  { id: "instagram", label: "Instagram", labelKey: "projets.socialPlatform.instagram", placeholder: "@handle", url: (h: string) => `https://instagram.com/${h}` },
  { id: "facebook", label: "Facebook", labelKey: "projets.socialPlatform.facebook", placeholder: "nom.de.profil", url: (h: string) => `https://facebook.com/${h}` },
  { id: "linkedin", label: "LinkedIn", labelKey: "projets.socialPlatform.linkedin", placeholder: "in/prenom-nom", url: (h: string) => `https://linkedin.com/${/^(in|company)\//.test(h) ? h : `in/${h}`}` },
  { id: "tiktok", label: "TikTok", labelKey: "projets.socialPlatform.tiktok", placeholder: "@handle", url: (h: string) => `https://tiktok.com/@${h}` },
  { id: "x", label: "X", labelKey: "projets.socialPlatform.x", placeholder: "@handle", url: (h: string) => `https://x.com/${h}` },
  { id: "threads", label: "Threads", labelKey: "projets.socialPlatform.threads", placeholder: "@handle", url: (h: string) => `https://threads.net/@${h}` },
  { id: "youtube", label: "YouTube", labelKey: "projets.socialPlatform.youtube", placeholder: "@chaine", url: (h: string) => `https://youtube.com/@${h}` },
  { id: "github", label: "GitHub", labelKey: "projets.socialPlatform.github", placeholder: "utilisateur", url: (h: string) => `https://github.com/${h}` },
  { id: "twitch", label: "Twitch", labelKey: "projets.socialPlatform.twitch", placeholder: "chaine", url: (h: string) => `https://twitch.tv/${h}` },
  { id: "behance", label: "Behance", labelKey: "projets.socialPlatform.behance", placeholder: "utilisateur", url: (h: string) => `https://behance.net/${h}` },
  { id: "whatsapp", label: "WhatsApp", labelKey: "projets.socialPlatform.whatsapp", placeholder: "15145551234", url: (h: string) => `https://wa.me/${h.replace(/\D/g, "")}` },
  { id: "website", label: "Site web", labelKey: "projets.socialPlatform.website", placeholder: "exemple.com", url: (h: string) => `https://${h}` },
  { id: "other", label: "Autre", labelKey: "projets.socialPlatform.other", placeholder: "https://…", url: (h: string) => `https://${h}` },
] as const;

export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number]["id"];
export const SOCIAL_PLATFORM_IDS = SOCIAL_PLATFORMS.map((p) => p.id) as [SocialPlatform, ...SocialPlatform[]];

export function socialPlatform(id: string) {
  return SOCIAL_PLATFORMS.find((p) => p.id === id) ?? SOCIAL_PLATFORMS[SOCIAL_PLATFORMS.length - 1];
}

/** Translated label for a social platform id. */
export function socialPlatformLabel(id: string): string {
  const p = socialPlatform(id);
  return tNow(p.labelKey) || p.label;
}

/** The link for what was typed: a URL as is, else the platform's profile URL. */
export function socialUrl(platform: string, value: string): string {
  const v = value.trim();
  if (/^https?:\/\//i.test(v)) return v;
  // "instagram.com/handle" typed without the scheme.
  if (/^[\w-]+(\.[\w-]+)+\//.test(v)) return `https://${v}`;
  return socialPlatform(platform).url(v.replace(/^@/, ""));
}

/** Short text for a link: the handle as typed, or the URL's path. */
export function socialLabel(value: string): string {
  const v = value.trim();
  if (!/^https?:\/\//i.test(v)) return v;
  try {
    const u = new URL(v);
    const path = u.pathname.replace(/\/$/, "").replace(/^\//, "");
    return path || u.hostname.replace(/^www\./, "");
  } catch {
    return v;
  }
}

const PLATFORM_HOSTS: [RegExp, SocialPlatform][] = [
  [/(^|\.)instagram\.com$/, "instagram"],
  [/(^|\.)(facebook|fb)\.com$/, "facebook"],
  [/(^|\.)linkedin\.com$/, "linkedin"],
  [/(^|\.)tiktok\.com$/, "tiktok"],
  [/(^|\.)(x|twitter)\.com$/, "x"],
  [/(^|\.)threads\.(net|com)$/, "threads"],
  [/(^|\.)(youtube\.com|youtu\.be)$/, "youtube"],
  [/(^|\.)github\.com$/, "github"],
  [/(^|\.)twitch\.tv$/, "twitch"],
  [/(^|\.)behance\.net$/, "behance"],
  [/(^|\.)(wa\.me|whatsapp\.com)$/, "whatsapp"],
];

/** The platform a pasted link belongs to, if it's a known one. */
export function detectPlatform(value: string): SocialPlatform | null {
  const v = value.trim();
  if (!/^(https?:\/\/)?[\w-]+(\.[\w-]+)+(\/|$)/i.test(v)) return null;
  try {
    const host = new URL(/^https?:/i.test(v) ? v : `https://${v}`).hostname.toLowerCase();
    return PLATFORM_HOSTS.find(([re]) => re.test(host))?.[1] ?? null;
  } catch {
    return null;
  }
}
