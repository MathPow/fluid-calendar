import { z } from "zod";

const hhmm = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Heure invalide (HH:mm)");
const hexColor = z.string().regex(/^#[0-9a-f]{6}$/i, "Couleur invalide");

export const LayerInput = z.object({
  name: z.string().trim().min(1, "Nom requis").max(60),
  visible: z.boolean().optional(),
});

export const BlockInput = z
  .object({
    // Optional on create: the user's first layer (created if needed) is used.
    layerId: z.string().min(1).optional(),
    title: z.string().trim().min(1, "Titre requis").max(60),
    kind: z.enum(["work", "sleep", "sport", "perso", "other"]).default("other"),
    color: hexColor.nullable().optional(),
    days: z
      .array(z.number().int().min(0).max(6))
      .min(1, "Choisis au moins un jour")
      .transform((d) => [...new Set(d)].sort()),
    startTime: hhmm,
    endTime: hhmm,
    schedulable: z.boolean().default(false),
  })
  .refine((b) => b.startTime !== b.endTime, {
    message: "Le bloc doit durer plus de zéro minute",
    path: ["endTime"],
  });

export type BlockInputType = z.infer<typeof BlockInput>;

/** Blocks in display order, for every layer read. */
export const layerInclude = {
  blocks: {
    orderBy: [{ sortOrder: "asc" as const }, { startTime: "asc" as const }],
  },
};
