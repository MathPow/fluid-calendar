-- A notification the user deleted. The row stays, so that a source reporting
-- the same news again (same dedupe key) does not bring it back.
ALTER TABLE "Notification" ADD COLUMN "dismissedAt" TIMESTAMP(3);
