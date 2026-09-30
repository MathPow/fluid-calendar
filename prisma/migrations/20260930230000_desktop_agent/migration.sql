-- Desktop agent: machines can run commands sent from DreamDash.
ALTER TABLE "Machine" ADD COLUMN "agentTokenHash" TEXT,
ADD COLUMN "agentSeenAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "Machine_agentTokenHash_key" ON "Machine"("agentTokenHash");

CREATE TABLE "DesktopCommand" (
    "id" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "args" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'queued',
    "output" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "DesktopCommand_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DesktopCommand_machineId_status_idx" ON "DesktopCommand"("machineId", "status");
CREATE INDEX "DesktopCommand_createdAt_idx" ON "DesktopCommand"("createdAt");
ALTER TABLE "DesktopCommand" ADD CONSTRAINT "DesktopCommand_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "Machine"("id") ON DELETE CASCADE ON UPDATE CASCADE;
