/**
 * Models the assistant can run on, picked from the chat panel. Safe to import
 * from client code (no SDK here).
 */

export const ASSISTANT_MODEL_IDS = [
  "claude-code",
  "claude-opus-5-5",
  "claude-sonnet-5-5",
  "claude-haiku-4-5",
  "local",
] as const;
export type AssistantModelId = (typeof ASSISTANT_MODEL_IDS)[number];

export interface AssistantModelInfo {
  id: AssistantModelId;
  label: string;
  /** One line under the label in the picker. */
  hint: string;
  /** A Claude model (sparkle icon); false = the local one. */
  claude: boolean;
  /**
   * What the server must have for it: the API key, or the Claude Code bridge
   * on uguiso (CLAUDE_BRIDGE_URL), which runs on the Claude subscription.
   */
  requires?: "api" | "bridge";
}

export const ASSISTANT_MODELS: AssistantModelInfo[] = [
  {
    id: "claude-code",
    label: "Claude (abonnement)",
    hint: "Claude Code sur uguiso · inclus dans l'abonnement",
    claude: true,
    requires: "bridge",
  },
  {
    id: "claude-opus-5-5",
    label: "Claude Opus 5.5",
    hint: "Le plus fort pour fouiller · le plus cher",
    claude: true,
    requires: "api",
  },
  {
    id: "claude-sonnet-5-5",
    label: "Claude Sonnet 5.5",
    hint: "Rapide et solide · moitié prix",
    claude: true,
    requires: "api",
  },
  {
    id: "claude-haiku-4-5",
    label: "Claude Haiku 4.5",
    hint: "Le plus rapide · questions simples",
    claude: true,
    requires: "api",
  },
  {
    id: "local",
    label: "Local (Ollama)",
    hint: "Gratuit, sur ton serveur · lent, sans outils",
    claude: false,
  },
];

export const DEFAULT_ASSISTANT_MODEL: AssistantModelId = "claude-code";

export const isAssistantModel = (v: unknown): v is AssistantModelId =>
  typeof v === "string" &&
  (ASSISTANT_MODEL_IDS as readonly string[]).includes(v);

export const assistantModelInfo = (id: AssistantModelId) =>
  ASSISTANT_MODELS.find((m) => m.id === id) ?? ASSISTANT_MODELS[0];
