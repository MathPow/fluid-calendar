-- Machine actions: Claude/Codex prompt shortcuts, optional scheduling with
-- recurrence, and per-shortcut last-run trace (result + error). Machine link
-- becomes nullable so a shortcut survives when its machine is removed.

ALTER TABLE "LaunchShortcut" DROP CONSTRAINT "LaunchShortcut_machineId_fkey";
ALTER TABLE "LaunchShortcut" ALTER COLUMN "machineId" DROP NOT NULL;
ALTER TABLE "LaunchShortcut"
  ADD COLUMN "kind"         TEXT      NOT NULL DEFAULT 'shell',
  ADD COLUMN "promptText"   TEXT,
  ADD COLUMN "scheduledFor" TIMESTAMP(3),
  ADD COLUMN "recurrence"   TEXT,
  ADD COLUMN "lastRunAt"    TIMESTAMP(3),
  ADD COLUMN "lastResult"   TEXT,
  ADD COLUMN "lastError"    TEXT;
ALTER TABLE "LaunchShortcut"
  ADD CONSTRAINT "LaunchShortcut_machineId_fkey"
  FOREIGN KEY ("machineId") REFERENCES "Machine"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "LaunchShortcut_scheduledFor_idx" ON "LaunchShortcut"("scheduledFor");
