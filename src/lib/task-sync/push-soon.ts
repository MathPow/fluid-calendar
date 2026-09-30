/**
 * Push local task edits to the external service (Trello, GitHub…) a few
 * seconds after they happen, instead of waiting for the 15-minute cron.
 *
 * Edits to the same list within the delay are pushed together, and a list
 * never syncs twice at once: the cron goes through the same lock.
 */
import { logger } from "@/lib/logger";

import { TaskSyncManager } from "./task-sync-manager";

const LOG_SOURCE = "task-sync-push-soon";
const DELAY_MS = 4000;

const timers = new Map<string, ReturnType<typeof setTimeout>>();
const running = new Set<string>();
const again = new Set<string>();

/** Run `fn` unless this list is already syncing; returns undefined when skipped. */
export async function withMappingLock<T>(mappingId: string, fn: () => Promise<T>): Promise<T | undefined> {
  if (running.has(mappingId)) {
    again.add(mappingId);
    return undefined;
  }
  running.add(mappingId);
  try {
    return await fn();
  } finally {
    running.delete(mappingId);
    // An edit came in while we were syncing: push it too.
    if (again.delete(mappingId)) pushSoon(mappingId);
  }
}

/** Schedule a sync of this list shortly; repeated calls reset the timer. */
export function pushSoon(mappingId: string | null | undefined) {
  if (!mappingId) return;
  const existing = timers.get(mappingId);
  if (existing) clearTimeout(existing);
  timers.set(
    mappingId,
    setTimeout(() => {
      timers.delete(mappingId);
      withMappingLock(mappingId, () => new TaskSyncManager().syncTaskList(mappingId)).catch((error) =>
        logger.warn(
          "Immediate push to the task provider failed; the cron will retry",
          { mappingId, error: error instanceof Error ? error.message : String(error) },
          LOG_SOURCE
        )
      );
    }, DELAY_MS)
  );
}
