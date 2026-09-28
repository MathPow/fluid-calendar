import { z } from "zod";

import { LINK_KIND_IDS } from "./meta";

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
  station: z.enum(["personal", "work"]).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  path: z.string().trim().max(500).nullable().optional(),
  parentId: z.string().nullable().optional(),
  stack: z.array(z.string().trim().min(1).max(40)).max(30).optional(),
  links: z.array(LinkInput).max(30).optional(),
  contacts: z.array(ProjectContactInput).max(50).optional(),
  archived: z.boolean().optional(),
});

export type ProjectInputType = z.infer<typeof ProjectInput>;

export const ContactInput = z.object({
  name: z.string().trim().min(1, "Nom requis").max(120),
  email: z.string().trim().email("Courriel invalide").max(200).or(z.literal("")).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  company: z.string().trim().max(120).nullable().optional(),
  role: z.string().trim().max(80).nullable().optional(),
  notes: z.string().trim().max(4000).nullable().optional(),
  projectIds: z.array(z.string().min(1)).max(100).optional(),
});

export type ContactInputType = z.infer<typeof ContactInput>;
