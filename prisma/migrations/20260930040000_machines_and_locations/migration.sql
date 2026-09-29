-- CreateTable
CREATE TABLE "Machine" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "label" TEXT,
  "ttydUrl" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Machine_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Machine_name_key" ON "Machine"("name");

-- CreateTable
CREATE TABLE "ProjectLocation" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "machineId" TEXT NOT NULL,
  "path" TEXT NOT NULL,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProjectLocation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ProjectLocation_projectId_machineId_key" ON "ProjectLocation"("projectId", "machineId");
CREATE INDEX "ProjectLocation_machineId_idx" ON "ProjectLocation"("machineId");
ALTER TABLE "ProjectLocation"
  ADD CONSTRAINT "ProjectLocation_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "AgentProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectLocation"
  ADD CONSTRAINT "ProjectLocation_machineId_fkey"
  FOREIGN KEY ("machineId") REFERENCES "Machine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "AgentActivity" ADD COLUMN "host" TEXT;

-- Seed the two machines that already run a web terminal.
INSERT INTO "Machine"("id","name","label","ttydUrl","createdAt","updatedAt") VALUES
  ('machine_uguiso',  'uguiso-ThinkCentre-M83', 'uguiso',  'https://uguiso-thinkcentre-m83.taila15d52.ts.net:7681/', now(), now()),
  ('machine_mathpow', 'mathpow',                'mathpow', 'https://mathpow.taila15d52.ts.net:7681/',                now(), now())
ON CONFLICT ("name") DO NOTHING;

-- Every path recorded so far came from the hook on uguiso.
INSERT INTO "ProjectLocation"("id","projectId","machineId","path","lastSeenAt")
SELECT 'loc_' || p."id", p."id", 'machine_uguiso', p."path", COALESCE(p."lastActivityAt", p."updatedAt")
FROM "AgentProject" p
WHERE p."path" IS NOT NULL AND p."path" <> ''
ON CONFLICT ("projectId","machineId") DO NOTHING;
