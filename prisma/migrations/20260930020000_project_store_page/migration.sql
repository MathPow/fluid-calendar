-- The showcase becomes a structured store page (gallery + about) instead of raw HTML.
ALTER TABLE "ProjectShowcase" DROP COLUMN "html",
ADD COLUMN "about" TEXT,
ADD COLUMN "status" TEXT,
ADD COLUMN "startedAt" TIMESTAMP(3),
ADD COLUMN "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "ProjectMedia" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "caption" TEXT,
    "mime" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "capsule" BOOLEAN NOT NULL DEFAULT false,
    "inGallery" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectMedia_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProjectMedia_projectId_idx" ON "ProjectMedia"("projectId");

ALTER TABLE "ProjectMedia" ADD CONSTRAINT "ProjectMedia_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "AgentProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
