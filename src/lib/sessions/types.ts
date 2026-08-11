import { z } from "zod";

/**
 * A place on the user's own machine that the agent may read and change as a
 * result of this session. Paths are never touched by the server — DreamDash only
 * carries them through to the mission, and Claude Code (which runs locally, with
 * filesystem access) is what actually opens them.
 */
export const TargetSchema = z.object({
  /** Absolute path on the user's machine, e.g. /home/mathys/repos/StayChum. */
  path: z.string().trim().min(1).max(500),
  /** "repo" = a code project, "doc" = a single document (business plan, etc.). */
  kind: z.enum(["repo", "doc"]).default("repo"),
  /** What the agent should do here, e.g. "update section 4 projections". */
  note: z.string().trim().max(500).optional(),
});

export type Target = z.infer<typeof TargetSchema>;

export const TargetsSchema = z.array(TargetSchema).max(25);

/** Statuses a WorkSession moves through. */
export type SessionStatus = "draft" | "processing" | "ready" | "error";

/** Parse the `targets` JSON column back into typed targets, tolerating junk. */
export function parseTargets(value: unknown): Target[] {
  const result = TargetsSchema.safeParse(value);
  return result.success ? result.data : [];
}
