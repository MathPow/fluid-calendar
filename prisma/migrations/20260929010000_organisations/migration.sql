-- CreateTable
CREATE TABLE "Organisation" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "color" TEXT,
  "station" TEXT NOT NULL DEFAULT 'personal',
  "description" TEXT,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Organisation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Organisation_slug_key" ON "Organisation"("slug");
CREATE INDEX "Organisation_sortOrder_idx" ON "Organisation"("sortOrder");

-- AlterTable
ALTER TABLE "AgentProject" ADD COLUMN "organisationId" TEXT;
CREATE INDEX "AgentProject_organisationId_idx" ON "AgentProject"("organisationId");
ALTER TABLE "AgentProject"
  ADD CONSTRAINT "AgentProject_organisationId_fkey"
  FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed: the two companies and the default bucket for random personal projects.
INSERT INTO "Organisation"("id","slug","name","color","station","description","isDefault","sortOrder","createdAt","updatedAt") VALUES
  ('org_dehorsqc', 'dehorsqc', 'DehorsQC', '#9fe0c4', 'work', 'Événements extérieurs : billetterie, boutique, admin.', false, 1, now(), now()),
  ('org_staychum', 'staychum', 'StayChum', '#a8ccff', 'work', NULL, false, 2, now(), now()),
  ('org_perso',    'perso',    'Perso',    '#ffd166', 'personal', 'Projets personnels et expérimentations.', true, 99, now(), now())
ON CONFLICT ("slug") DO NOTHING;

-- Attach the repos that obviously belong to DehorsQC.
UPDATE "AgentProject" SET "organisationId" = 'org_dehorsqc'
WHERE "organisationId" IS NULL
  AND (lower(slug) LIKE 'dehors%' OR lower(slug) LIKE 'hi-events-%');
