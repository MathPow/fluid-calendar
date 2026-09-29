-- AlterTable
ALTER TABLE "TaxProfile" ADD COLUMN "partners" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN "paidBy" TEXT;

-- CreateTable
CREATE TABLE "PartnerMovement" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "kind" TEXT NOT NULL,
    "partner" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "account" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartnerMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PartnerMovement_organisationId_date_idx" ON "PartnerMovement"("organisationId", "date");

-- AddForeignKey
ALTER TABLE "PartnerMovement" ADD CONSTRAINT "PartnerMovement_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
