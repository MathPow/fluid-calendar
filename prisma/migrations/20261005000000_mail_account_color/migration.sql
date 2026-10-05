-- Per-account dot colour in the mail client, picked when connecting a box.
ALTER TABLE "MailAccount" ADD COLUMN "color" TEXT;

-- Seed the existing boxes: iCloud stays blue, staychum pink, dehorsqc orange.
UPDATE "MailAccount" SET "color" = 'pink' WHERE "email" ILIKE '%staychum%';
UPDATE "MailAccount" SET "color" = 'orange' WHERE "email" ILIKE '%dehorsqc%';
UPDATE "MailAccount" SET "color" = 'sky' WHERE "color" IS NULL AND "provider" = 'icloud';
