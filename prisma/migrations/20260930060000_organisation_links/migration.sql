-- Links on organisations, like the ones on projects.
CREATE TABLE "OrganisationLink" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'other',
    "label" TEXT,
    "url" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OrganisationLink_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OrganisationLink_organisationId_idx" ON "OrganisationLink"("organisationId");

ALTER TABLE "OrganisationLink" ADD CONSTRAINT "OrganisationLink_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
