import { z } from "zod";

import { tNow } from "@/i18n/now";

/**
 * What DreamDash can ask a machine's desktop agent to do. Everything but
 * `shell` runs at once; `shell` waits for a Yes in a dialog on the desktop.
 * The agent (scripts/desktop-agent/agent.mjs) re-checks every argument.
 */
const absPath = z
  .string()
  .trim()
  .regex(/^\/[^\0]{0,500}$/, "Chemin absolu attendu");

/**
 * Translation helpers. The schemas live at module scope so Zod sees their
 * default French message; the i18n `labelKey` / `errorKey` fields let the UI
 * (and `tNow`) swap to the current locale at render time.
 */
export const DESKTOP_ACTIONS = {
  open_url: {
    label: "Ouvrir une adresse",
    labelKey: "machines.action.open_url.label",
    schema: z.object({
      url: z
        .string()
        .trim()
        .url()
        .regex(/^https?:\/\//i, "http(s) seulement"),
    }),
  },
  open_path: {
    label: "Ouvrir un dossier ou un fichier",
    labelKey: "machines.action.open_path.label",
    schema: z.object({ path: absPath }),
  },
  open_code: {
    label: "Ouvrir dans VS Code",
    labelKey: "machines.action.open_code.label",
    schema: z.object({ path: absPath }),
  },
  open_app: {
    label: "Lancer une application",
    labelKey: "machines.action.open_app.label",
    // A .desktop id: firefox, org.gnome.Nautilus, code…
    schema: z.object({
      app: z
        .string()
        .trim()
        .regex(/^[A-Za-z0-9._-]{1,120}$/, "Nom d'application invalide"),
    }),
  },
  notify: {
    label: "Afficher une notification",
    labelKey: "machines.action.notify.label",
    schema: z.object({
      title: z.string().trim().min(1).max(120),
      body: z.string().trim().max(500).optional(),
    }),
  },
  clipboard: {
    label: "Copier dans le presse-papiers",
    labelKey: "machines.action.clipboard.label",
    schema: z.object({ text: z.string().min(1).max(10_000) }),
  },
  lock: {
    label: "Verrouiller l'écran",
    labelKey: "machines.action.lock.label",
    schema: z.object({}),
  },
  shell: {
    label: "Commande shell (confirmée sur l'ordi)",
    labelKey: "machines.action.shell.label",
    schema: z.object({
      command: z.string().trim().min(1).max(2000),
      cwd: absPath.optional(),
    }),
  },
  agent_run: {
    // Runs on the desktop agent without zenity — reserved for prompt shortcuts
    // that were explicitly approved at creation time. Never shown in the UI
    // action picker; the launcher-run route sets it directly.
    label: "Prompt agent (sans confirmation)",
    labelKey: "machines.action.agent_run.label",
    schema: z.object({
      command: z.string().trim().min(1).max(4000),
      input: z.string().max(200_000).optional(),
      cwd: absPath.optional(),
    }),
  },
} as const;

/** Actions that show up in the shell-launcher picker. `agent_run` is hidden. */
export const USER_DESKTOP_ACTION_IDS = [
  "open_url",
  "open_path",
  "open_code",
  "open_app",
  "notify",
  "clipboard",
  "lock",
  "shell",
] as const;

export type DesktopAction = keyof typeof DESKTOP_ACTIONS;

export const DESKTOP_ACTION_IDS = Object.keys(DESKTOP_ACTIONS) as [
  DesktopAction,
  ...DesktopAction[],
];

export const CommandInput = z
  .object({
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
    return { action: v.action, args: parsed.data as Record<string, unknown> };
  });

/** An agent is « en ligne » when it polled in the last minute. */
export const agentOnline = (seenAt: Date | string | null | undefined) =>
  !!seenAt && Date.now() - new Date(seenAt).getTime() < 60_000;

/** One-line summary of a command for the history list. */
export function describeCommand(
  action: string,
  args: Record<string, unknown>,
  /** UI translator; without it the summary uses the current locale via tNow. */
  t?: (key: string, params?: Record<string, string | number>) => string
): string {
  const a = args as Record<string, string>;
  const tr = (key: string, params?: Record<string, string | number>) =>
    t ? t(key, params) : tNow(key, params);
  switch (action) {
    case "open_url":
      return tr("machines.describe.open", { target: a.url });
    case "open_path":
      return tr("machines.describe.open", { target: a.path });
    case "open_code":
      return `VS Code · ${a.path}`;
    case "open_app":
      return tr("machines.describe.openApp", { app: a.app });
    case "notify":
      return tr("machines.describe.notify", { title: a.title });
    case "clipboard":
      return tr("machines.describe.clipboard", {
        count: String(a.text ?? "").length,
      });
    case "lock":
      return tr("machines.describe.lock");
    case "shell":
      return `$ ${a.command}`;
    case "agent_run":
      return `$ ${a.command}`;
    default:
      return action;
  }
}
