-- Profile images
ALTER TABLE "Contact" ADD COLUMN "image" TEXT;
ALTER TABLE "AgentProject" ADD COLUMN "image" TEXT;
ALTER TABLE "Organisation" ADD COLUMN "image" TEXT;

-- Relation becomes a category; the precise wording moves to relationDetail.
ALTER TABLE "Contact" ADD COLUMN "relationDetail" TEXT;
UPDATE "Contact" SET "relationDetail" = "relation" WHERE "relation" IS NOT NULL;
UPDATE "Contact" SET "relation" = CASE
  WHEN "relation" IN ('Ami') THEN 'ami'
  WHEN "relation" LIKE 'Ami %' THEN 'ami'
  WHEN "relation" IN ('Ex beau-père') THEN 'famille'
  WHEN "relation" LIKE 'Classe%' OR "relation" LIKE 'Au primaire%' THEN 'ecole'
  WHEN "relation" LIKE '%mon client%' THEN 'client'
  WHEN "relation" LIKE 'Coéquipier%' THEN 'collegue'
  WHEN "relation" LIKE 'Partner%' THEN 'partenaire'
  ELSE 'connaissance'
END
WHERE "relation" IS NOT NULL;
-- When the category says it all, no detail is needed.
UPDATE "Contact" SET "relationDetail" = NULL WHERE "relationDetail" IN ('Ami');
