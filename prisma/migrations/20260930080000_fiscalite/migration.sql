-- CreateTable
CREATE TABLE "TaxProfile" (
    "organisationId" TEXT NOT NULL,
    "legalForm" TEXT NOT NULL DEFAULT 'individuelle',
    "salesTaxStatus" TEXT NOT NULL DEFAULT 'petit',
    "gstNumber" TEXT,
    "qstNumber" TEXT,
    "filingFrequency" TEXT NOT NULL DEFAULT 'annuelle',
    "fiscalYearEnd" TEXT NOT NULL DEFAULT '12-31',
    "notes" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxProfile_pkey" PRIMARY KEY ("organisationId")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "direction" TEXT NOT NULL DEFAULT 'depense',
    "date" TIMESTAMP(3) NOT NULL,
    "party" TEXT,
    "partyTaxNumber" TEXT,
    "number" TEXT,
    "description" TEXT,
    "category" TEXT,
    "subtotalCents" INTEGER NOT NULL DEFAULT 0,
    "gstCents" INTEGER NOT NULL DEFAULT 0,
    "qstCents" INTEGER NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceFile" (
    "invoiceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "text" TEXT,

    CONSTRAINT "InvoiceFile_pkey" PRIMARY KEY ("invoiceId")
);

-- CreateIndex
CREATE INDEX "Invoice_organisationId_date_idx" ON "Invoice"("organisationId", "date");

-- AddForeignKey
ALTER TABLE "TaxProfile" ADD CONSTRAINT "TaxProfile_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceFile" ADD CONSTRAINT "InvoiceFile_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
