import { z } from "zod";

import { DESKTOP_ACTIONS, DESKTOP_ACTION_IDS } from "./desktop-actions";

/** Icons a launch button can wear (lucide names, mapped in LauncherIcon). */
export const LAUNCHER_ICONS = [
  "zap",
  "code",
  "terminal",
  "globe",
  "folder",
  "app",
  "lock",
  "git",
  "rocket",
  "play",
  "refresh",
  "music",
  "coffee",
  "message",
  "clipboard",
] as const;
export type LauncherIconId = (typeof LAUNCHER_ICONS)[number];

export const LauncherInput = z
  .object({
    label: z.string().trim().min(1, "Libellé requis").max(40),
    icon: z.enum(LAUNCHER_ICONS).default("zap"),
    machineId: z.string().min(1, "Machine requise"),
    action: z.enum(DESKTOP_ACTION_IDS),
    args: z.record(z.unknown()).default({}),
  })
  .transform((v, ctx) => {
    const parsed = DESKTOP_ACTIONS[v.action].schema.safeParse(v.args);
    if (!parsed.success) {
      ctx.addIssue({
        code: "custom",
        message: parsed.error.issues[0]?.message ?? "Arguments invalides",
      });
      return z.NEVER;
    }
    return { ...v, args: parsed.data as Record<string, unknown> };
  });

export type LauncherRow = {
  id: string;
  label: string;
  icon: string;
  action: string;
  args: Record<string, unknown>;
  sortOrder: number;
  machine: {
    id: string;
    name: string;
    label: string | null;
    agentSeenAt: string | null;
  };
};

/** Fields every launcher read returns (never the machine's token hash). */
export const launcherSelect = {
  id: true,
  label: true,
  icon: true,
  action: true,
  args: true,
  sortOrder: true,
  machine: { select: { id: true, name: true, label: true, agentSeenAt: true } },
} as const;
