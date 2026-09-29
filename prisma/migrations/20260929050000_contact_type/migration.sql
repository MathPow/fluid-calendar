-- AlterTable
ALTER TABLE "Contact" ADD COLUMN "type" TEXT NOT NULL DEFAULT 'person';
CREATE INDEX "Contact_type_idx" ON "Contact"("type");
