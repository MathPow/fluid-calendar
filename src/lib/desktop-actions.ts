import { z } from "zod";

/**
 * What DreamDash can ask a machine's desktop agent to do. Everything but
 * `shell` runs at once; `shell` waits for a Yes in a dialog on the desktop.
 * The agent (scripts/desktop-agent/agent.mjs) re-checks every argument.
 */
const absPath = z
  .string()
  .trim()
  .regex(/^\/[^\0]{0,500}$/, "Chemin absolu attendu");

export const DESKTOP_ACTIONS = {
  open_url: {
    label: "Ouvrir une adresse",
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
    schema: z.object({ path: absPath }),
  },
  open_code: {
    label: "Ouvrir dans VS Code",
    schema: z.object({ path: absPath }),
  },
  open_app: {
    label: "Lancer une application",
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
    schema: z.object({
      title: z.string().trim().min(1).max(120),
      body: z.string().trim().max(500).optional(),
    }),
  },
  clipboard: {
    label: "Copier dans le presse-papiers",
    schema: z.object({ text: z.string().min(1).max(10_000) }),
  },
  lock: {
    label: "Verrouiller l'écran",
    schema: z.object({}),
  },
  shell: {
    label: "Commande shell (confirmée sur l'ordi)",
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
  args: Record<string, unknown>
): string {
  const a = args as Record<string, string>;
  switch (action) {
    case "open_url":
      return `Ouvrir ${a.url}`;
    case "open_path":
      return `Ouvrir ${a.path}`;
    case "open_code":
      return `VS Code · ${a.path}`;
    case "open_app":
      return `Lancer ${a.app}`;
    case "notify":
      return `Notification « ${a.title} »`;
    case "clipboard":
      return `Presse-papiers (${String(a.text ?? "").length} caractères)`;
    case "lock":
      return "Verrouiller l'écran";
    case "shell":
      return `$ ${a.command}`;
    case "agent_run":
      return `$ ${a.command}`;
    default:
      return action;
  }
}
