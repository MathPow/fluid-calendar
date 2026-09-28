-- AlterTable: project specs
ALTER TABLE "AgentProject"
  ADD COLUMN "color" TEXT,
  ADD COLUMN "station" TEXT NOT NULL DEFAULT 'personal',
  ADD COLUMN "description" TEXT,
  ADD COLUMN "stack" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "archived" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "parentId" TEXT;

CREATE INDEX "AgentProject_parentId_idx" ON "AgentProject"("parentId");
CREATE INDEX "AgentProject_station_idx" ON "AgentProject"("station");

ALTER TABLE "AgentProject"
  ADD CONSTRAINT "AgentProject_parentId_fkey"
  FOREIGN KEY ("parentId") REFERENCES "AgentProject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: ProjectLink
CREATE TABLE "ProjectLink" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'other',
  "label" TEXT,
  "url" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "ProjectLink_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ProjectLink_projectId_idx" ON "ProjectLink"("projectId");
ALTER TABLE "ProjectLink"
  ADD CONSTRAINT "ProjectLink_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "AgentProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: Contact
CREATE TABLE "Contact" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT,
  "phone" TEXT,
  "company" TEXT,
  "role" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Contact_name_idx" ON "Contact"("name");

-- CreateTable: ProjectContact
CREATE TABLE "ProjectContact" (
  "projectId" TEXT NOT NULL,
  "contactId" TEXT NOT NULL,
  "role" TEXT,
  CONSTRAINT "ProjectContact_pkey" PRIMARY KEY ("projectId","contactId")
);
CREATE INDEX "ProjectContact_contactId_idx" ON "ProjectContact"("contactId");
ALTER TABLE "ProjectContact"
  ADD CONSTRAINT "ProjectContact_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "AgentProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectContact"
  ADD CONSTRAINT "ProjectContact_contactId_fkey"
  FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
