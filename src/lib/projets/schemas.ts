import { z } from "zod";

import {
  LINK_KIND_IDS,
  ORG_KIND_IDS,
  RELATION_KIND_IDS,
  SOCIAL_PLATFORM_IDS,
  isAllowedImage,
} from "./meta";

const image = z
  .string()
  .max(700_000, "Image trop lourde")
  .refine(isAllowedImage, "Image invalide")
  .nullable()
  .optional();

const hexColor = z.string().regex(/^#[0-9a-f]{6}$/i, "Couleur invalide");

export const LinkInput = z.object({
  kind: z.enum(LINK_KIND_IDS).default("other"),
  label: z.string().trim().max(80).nullable().optional(),
  url: z.string().trim().url("URL invalide").max(2000),
});

export const ProjectContactInput = z.object({
  contactId: z.string().min(1),
  role: z.string().trim().max(80).nullable().optional(),
});

export const ProjectInput = z.object({
  name: z.string().trim().min(1, "Nom requis").max(120),
  color: hexColor.nullable().optional(),
  image,
  station: z.enum(["personal", "work"]).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  path: z.string().trim().max(500).nullable().optional(),
  // Where the project lives: machine + its folder there, one row per machine
  // (ProjectLocation). When present, replaces the whole list.
  locations: z
    .array(
      z.object({
        machineId: z.string().min(1),
        path: z.string().trim().min(1, "Chemin requis").max(500),
      })
    )
    .max(20)
    .refine((l) => new Set(l.map((x) => x.machineId)).size === l.length, "Une machine est en double")
    .optional(),
  parentId: z.string().nullable().optional(),
  organisationId: z.string().nullable().optional(),
  stack: z.array(z.string().trim().min(1).max(40)).max(30).optional(),
  links: z.array(LinkInput).max(30).optional(),
  contacts: z.array(ProjectContactInput).max(50).optional(),
  archived: z.boolean().optional(),
});

export type ProjectInputType = z.infer<typeof ProjectInput>;

export const ContactInput = z.object({
  type: z.enum(["person", "company"]).optional(),
  name: z.string().trim().min(1, "Nom requis").max(120),
  email: z
    .string()
    .trim()
    .email("Courriel invalide")
    .max(200)
    .or(z.literal(""))
    .nullable()
    .optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  company: z.string().trim().max(120).nullable().optional(),
  role: z.string().trim().max(80).nullable().optional(),
  relation: z.enum(RELATION_KIND_IDS).nullable().optional(),
  relationDetail: z.string().trim().max(120).nullable().optional(),
  image,
  favorite: z.boolean().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(50).optional(),
  notes: z.string().trim().max(4000).nullable().optional(),
  projectIds: z.array(z.string().min(1)).max(100).optional(),
  /** Replaces the whole list when present. */
  links: z
    .array(
      z.object({
        platform: z.enum(SOCIAL_PLATFORM_IDS),
        value: z.string().trim().min(1).max(300),
      })
    )
    .max(30)
    .optional(),
});

export type ContactInputType = z.infer<typeof ContactInput>;

export const OrganisationInput = z.object({
  name: z.string().trim().min(1, "Nom requis").max(80),
  color: hexColor.nullable().optional(),
  image,
  kind: z.enum(ORG_KIND_IDS).optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  links: z.array(LinkInput).max(30).optional(),
});

export const MachineInput = z.object({
  name: z.string().trim().min(1, "Nom requis").max(120),
  label: z.string().trim().max(80).nullable().optional(),
  ttydUrl: z
    .string()
    .trim()
    .max(300)
    .refine((v) => v === "" || /^https?:\/\/\S+$/.test(v), "URL invalide")
    .nullable()
    .optional(),
  statsUrl: z
    .string()
    .trim()
    .max(300)
    .refine((v) => v === "" || /^https?:\/\/\S+$/.test(v), "URL invalide")
    .nullable()
    .optional(),
  kind: z.enum(["local", "vps"]).optional(),
  host: z.string().trim().max(200).nullable().optional(),
  ip: z.string().trim().max(64).nullable().optional(),
  sshUser: z.string().trim().max(64).nullable().optional(),
  sshKey: z.string().trim().max(300).nullable().optional(),
  provider: z.string().trim().max(80).nullable().optional(),
  notes: z.string().trim().max(4000).nullable().optional(),
});

export type MachineInputType = z.infer<typeof MachineInput>;

/** Prisma data for the optional machine fields present in a payload. */
export function machineFields(f: Partial<MachineInputType>) {
  const text = (v: string | null | undefined) => (v ? v : null);
  return {
    ...(f.label !== undefined ? { label: text(f.label) } : {}),
    ...(f.ttydUrl !== undefined ? { ttydUrl: text(f.ttydUrl) } : {}),
    ...(f.statsUrl !== undefined ? { statsUrl: text(f.statsUrl) } : {}),
    ...(f.kind !== undefined ? { kind: f.kind } : {}),
    ...(f.host !== undefined ? { host: text(f.host) } : {}),
    ...(f.ip !== undefined ? { ip: text(f.ip) } : {}),
    ...(f.sshUser !== undefined ? { sshUser: text(f.sshUser) } : {}),
    ...(f.sshKey !== undefined ? { sshKey: text(f.sshKey) } : {}),
    ...(f.provider !== undefined ? { provider: text(f.provider) } : {}),
    ...(f.notes !== undefined ? { notes: text(f.notes) } : {}),
  };
}
