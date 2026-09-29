-- AlterTable
ALTER TABLE "CalendarFeed" ADD COLUMN "organisationId" TEXT;
CREATE INDEX "CalendarFeed_organisationId_idx" ON "CalendarFeed"("organisationId");
ALTER TABLE "CalendarFeed"
  ADD CONSTRAINT "CalendarFeed_organisationId_fkey"
  FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
