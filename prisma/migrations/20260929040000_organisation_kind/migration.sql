-- AlterTable
ALTER TABLE "Organisation" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'client';

-- Seeded rows: Perso is personal; DehorsQC and StayChum are companies I have a stake in.
UPDATE "Organisation" SET "kind" = 'perso', "station" = 'personal' WHERE "isDefault" = true OR "slug" = 'perso';
UPDATE "Organisation" SET "kind" = 'owned', "station" = 'work' WHERE "slug" IN ('dehorsqc', 'staychum');
