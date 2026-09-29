-- AlterTable
ALTER TABLE "TaxProfile" ADD COLUMN "setUp" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "tracked" BOOLEAN NOT NULL DEFAULT true;

-- The companies that are mine start flagged; everything else is opt-in.
INSERT INTO "TaxProfile" ("organisationId", "tracked", "setUp", "updatedAt")
SELECT o."id", true, false, CURRENT_TIMESTAMP
FROM "Organisation" o
WHERE o."kind" = 'owned'
  AND NOT EXISTS (SELECT 1 FROM "TaxProfile" t WHERE t."organisationId" = o."id");
