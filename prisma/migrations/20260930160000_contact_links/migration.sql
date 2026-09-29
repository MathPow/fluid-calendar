-- CreateTable
CREATE TABLE "ContactLink" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ContactLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContactLink_contactId_idx" ON "ContactLink"("contactId");

-- AddForeignKey
ALTER TABLE "ContactLink" ADD CONSTRAINT "ContactLink_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
