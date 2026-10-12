-- People left out of a social import, so the next one skips them.
CREATE TABLE "ContactImportDismissal" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactImportDismissal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ContactImportDismissal_key_key" ON "ContactImportDismissal"("key");
