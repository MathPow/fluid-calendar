-- CreateTable
CREATE TABLE "EventOrganisation" (
    "feedId" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventOrganisation_pkey" PRIMARY KEY ("feedId","eventKey")
);

-- CreateIndex
CREATE INDEX "EventOrganisation_organisationId_idx" ON "EventOrganisation"("organisationId");

-- AddForeignKey
ALTER TABLE "EventOrganisation" ADD CONSTRAINT "EventOrganisation_feedId_fkey" FOREIGN KEY ("feedId") REFERENCES "CalendarFeed"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventOrganisation" ADD CONSTRAINT "EventOrganisation_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
