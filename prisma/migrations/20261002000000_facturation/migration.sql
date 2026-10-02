-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "applyTaxes" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "billTo" TEXT,
ADD COLUMN     "clientEmail" TEXT,
ADD COLUMN     "contactId" TEXT,
ADD COLUMN     "dueDate" TIMESTAMP(3),
ADD COLUMN     "lang" TEXT,
ADD COLUMN     "lines" JSONB,
ADD COLUMN     "paidAt" TIMESTAMP(3),
ADD COLUMN     "recurringId" TEXT,
ADD COLUMN     "sentAt" TIMESTAMP(3),
ADD COLUMN     "sentTo" TEXT,
ADD COLUMN     "status" TEXT;

-- CreateTable
CREATE TABLE "RecurringInvoice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "contactId" TEXT,
    "title" TEXT NOT NULL,
    "party" TEXT NOT NULL,
    "billTo" TEXT,
    "clientEmail" TEXT,
    "cc" TEXT,
    "lines" JSONB NOT NULL,
    "applyTaxes" BOOLEAN NOT NULL DEFAULT false,
    "lang" TEXT NOT NULL DEFAULT 'fr',
    "notes" TEXT,
    "frequency" TEXT NOT NULL DEFAULT 'monthly',
    "interval" INTEGER NOT NULL DEFAULT 1,
    "dueDays" INTEGER NOT NULL DEFAULT 30,
    "nextRunAt" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "autoSend" BOOLEAN NOT NULL DEFAULT true,
    "mailAccountId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastInvoiceId" TEXT,
    "lastRunAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecurringInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoicingSettings" (
    "organisationId" TEXT NOT NULL,
    "numberPrefix" TEXT,
    "dueDays" INTEGER NOT NULL DEFAULT 30,
    "lang" TEXT NOT NULL DEFAULT 'fr',
    "notes" TEXT,
    "mailAccountId" TEXT,
    "emailSubject" TEXT,
    "emailBody" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvoicingSettings_pkey" PRIMARY KEY ("organisationId")
);

-- CreateIndex
CREATE INDEX "RecurringInvoice_active_nextRunAt_idx" ON "RecurringInvoice"("active", "nextRunAt");

-- CreateIndex
CREATE INDEX "RecurringInvoice_organisationId_idx" ON "RecurringInvoice"("organisationId");

-- CreateIndex
CREATE INDEX "Invoice_contactId_idx" ON "Invoice"("contactId");

-- CreateIndex
CREATE INDEX "Invoice_recurringId_idx" ON "Invoice"("recurringId");

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_recurringId_fkey" FOREIGN KEY ("recurringId") REFERENCES "RecurringInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringInvoice" ADD CONSTRAINT "RecurringInvoice_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringInvoice" ADD CONSTRAINT "RecurringInvoice_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoicingSettings" ADD CONSTRAINT "InvoicingSettings_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

