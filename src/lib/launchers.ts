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

/** Which kind of launcher — shell (desktop agent, confirmed) or a Claude /
 * Codex prompt fired at a machine with no re-confirmation. */
export const LAUNCHER_KINDS = ["shell", "claude-prompt", "codex-prompt"] as const;
export type LauncherKind = (typeof LAUNCHER_KINDS)[number];

/** Recurrence for a scheduled prompt shortcut. `null` means one-shot. */
export const LAUNCHER_RECURRENCES = ["daily", "weekly", "monthly"] as const;
export type LauncherRecurrence = (typeof LAUNCHER_RECURRENCES)[number];

export const isPromptKind = (kind: string) =>
  kind === "claude-prompt" || kind === "codex-prompt";

const nullableRecurrence = z
  .enum(LAUNCHER_RECURRENCES)
  .nullable()
  .optional()
  .transform((v) => v ?? null);

const nullableScheduled = z
  .union([z.string().datetime(), z.date(), z.null()])
  .optional()
  .transform((v) => (v ? new Date(v) : null));

export const LauncherInput = z
  .object({
    label: z.string().trim().min(1, "Libellé requis").max(40),
    icon: z.enum(LAUNCHER_ICONS).default("zap"),
    kind: z.enum(LAUNCHER_KINDS).default("shell"),
    machineId: z.string().min(1).nullable().optional(),
    action: z.enum(DESKTOP_ACTION_IDS).optional(),
    args: z.record(z.unknown()).default({}),
    promptText: z.string().trim().max(20_000).optional().nullable(),
    scheduledFor: nullableScheduled,
    recurrence: nullableRecurrence,
  })
  .superRefine((v, ctx) => {
    if (v.kind === "shell") {
      if (!v.action) {
        ctx.addIssue({ code: "custom", message: "Action requise", path: ["action"] });
        return;
      }
      const parsed = DESKTOP_ACTIONS[v.action].schema.safeParse(v.args);
      if (!parsed.success) {
        ctx.addIssue({
          code: "custom",
          message: parsed.error.issues[0]?.message ?? "Arguments invalides",
          path: ["args"],
        });
        return;
      }
    } else {
      if (!v.promptText || !v.promptText.trim()) {
        ctx.addIssue({
          code: "custom",
          message: "Prompt requis",
          path: ["promptText"],
        });
      }
      if (!v.machineId) {
        ctx.addIssue({
          code: "custom",
          message: "Machine requise",
          path: ["machineId"],
        });
      }
    }
    if (v.scheduledFor && v.kind === "shell") {
      ctx.addIssue({
        code: "custom",
        message: "La planification n'est disponible que pour les prompts.",
        path: ["scheduledFor"],
      });
    }
  })
  .transform((v) => ({
    label: v.label,
    icon: v.icon,
    kind: v.kind,
    machineId: v.machineId ?? null,
    action: v.kind === "shell" ? (v.action as string) : "run_prompt",
    args:
      v.kind === "shell"
        ? (DESKTOP_ACTIONS[v.action!].schema.parse(v.args) as Record<string, unknown>)
        : {},
    promptText: v.kind === "shell" ? null : v.promptText!.trim(),
    scheduledFor: v.scheduledFor,
    recurrence: v.scheduledFor ? v.recurrence : null,
  }));

export type LauncherRow = {
  id: string;
  label: string;
  icon: string;
  kind: string;
  action: string;
  args: Record<string, unknown>;
  promptText: string | null;
  scheduledFor: string | null;
  recurrence: string | null;
  lastRunAt: string | null;
  lastResult: string | null;
  lastError: string | null;
  sortOrder: number;
  machine: {
    id: string;
    name: string;
    label: string | null;
    agentSeenAt: string | null;
  } | null;
};

/** Fields every launcher read returns (never the machine's token hash). */
export const launcherSelect = {
  id: true,
  label: true,
  icon: true,
  kind: true,
  action: true,
  args: true,
  promptText: true,
  scheduledFor: true,
  recurrence: true,
  lastRunAt: true,
  lastResult: true,
  lastError: true,
  sortOrder: true,
  machine: { select: { id: true, name: true, label: true, agentSeenAt: true } },
} as const;
