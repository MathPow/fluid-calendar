-- Showcase runs: /project-showcase requests queued from the project page and
-- executed by the host runner.
CREATE TABLE "ShowcaseRun" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "log" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "ShowcaseRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ShowcaseRun_projectId_idx" ON "ShowcaseRun"("projectId");
CREATE INDEX "ShowcaseRun_status_idx" ON "ShowcaseRun"("status");

ALTER TABLE "ShowcaseRun" ADD CONSTRAINT "ShowcaseRun_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "AgentProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
