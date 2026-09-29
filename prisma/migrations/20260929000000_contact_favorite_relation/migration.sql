-- AlterTable
ALTER TABLE "Contact"
  ADD COLUMN "relation" TEXT,
  ADD COLUMN "favorite" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "Contact_favorite_idx" ON "Contact"("favorite");

-- Backfill from the first import, where these lived in the notes as
-- "⭐ Contact clé · Lien : <relation> · <notes>".
UPDATE "Contact"
SET favorite = true,
    notes = NULLIF(regexp_replace(notes, '^⭐ Contact clé( · )?', ''), '')
WHERE notes LIKE '⭐ Contact clé%';

UPDATE "Contact"
SET relation = (regexp_match(notes, 'Lien : ([^·]+?)(?: · |$)'))[1],
    notes = NULLIF(regexp_replace(notes, '(^|( · ))Lien : [^·]+?(( · )|$)', '\2'), '')
WHERE notes ~ 'Lien : ';
