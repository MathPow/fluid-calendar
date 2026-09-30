-- Account-menu launch buttons: saved commands for a machine's desktop agent.
CREATE TABLE "LaunchShortcut" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "icon" TEXT NOT NULL DEFAULT 'zap',
    "action" TEXT NOT NULL,
    "args" JSONB NOT NULL DEFAULT '{}',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LaunchShortcut_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "LaunchShortcut_userId_sortOrder_idx" ON "LaunchShortcut"("userId", "sortOrder");
ALTER TABLE "LaunchShortcut" ADD CONSTRAINT "LaunchShortcut_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LaunchShortcut" ADD CONSTRAINT "LaunchShortcut_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "Machine"("id") ON DELETE CASCADE ON UPDATE CASCADE;
