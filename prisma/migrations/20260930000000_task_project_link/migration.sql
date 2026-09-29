-- AlterTable
ALTER TABLE "Project" ADD COLUMN "agentProjectId" TEXT;
CREATE UNIQUE INDEX "Project_agentProjectId_key" ON "Project"("agentProjectId");
ALTER TABLE "Project"
  ADD CONSTRAINT "Project_agentProjectId_fkey"
  FOREIGN KEY ("agentProjectId") REFERENCES "AgentProject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Link task lists to the Projets-tab project of the same name, when the match is unambiguous.
UPDATE "Project" p
SET "agentProjectId" = a.id
FROM "AgentProject" a
WHERE p."agentProjectId" IS NULL
  AND (lower(a.name) = lower(p.name) OR lower(a.slug) = lower(p.name))
  AND (SELECT count(*) FROM "AgentProject" a2 WHERE lower(a2.name) = lower(p.name) OR lower(a2.slug) = lower(p.name)) = 1
  AND (SELECT count(*) FROM "Project" p2 WHERE lower(p2.name) = lower(p.name)) = 1;
