-- Task sync connections (Trello, GitHub…) can belong to an organisation, and
-- there can be several of the same service: one Trello per organisation.
DROP INDEX IF EXISTS "TaskProvider_userId_type_key";

ALTER TABLE "TaskProvider" ADD COLUMN "organisationId" TEXT;
ALTER TABLE "TaskProvider"
  ADD CONSTRAINT "TaskProvider_organisationId_fkey"
  FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "TaskProvider_organisationId_idx" ON "TaskProvider"("organisationId");

-- A task list that is not attached to a project of the Projets tab can still
-- sit under an organisation (a synced board filed under DehorsQC, say).
ALTER TABLE "Project" ADD COLUMN "organisationId" TEXT;
ALTER TABLE "Project"
  ADD CONSTRAINT "Project_organisationId_fkey"
  FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Project_organisationId_idx" ON "Project"("organisationId");
