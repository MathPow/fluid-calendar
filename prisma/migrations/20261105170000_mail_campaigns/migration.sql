-- AlterTable
ALTER TABLE "MailAccount" ADD COLUMN "campaignScanUid" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "MailCampaign" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT,
    "name" TEXT NOT NULL,
    "fromName" TEXT,
    "footer" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "pauseReason" TEXT,
    "dailyLimit" INTEGER NOT NULL DEFAULT 50,
    "sendFromHour" INTEGER NOT NULL DEFAULT 9,
    "sendUntilHour" INTEGER NOT NULL DEFAULT 17,
    "weekdaysOnly" BOOLEAN NOT NULL DEFAULT true,
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "testSentAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailCampaignRecipient" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "email" TEXT NOT NULL,
    "organisation" TEXT,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "reviewNote" TEXT,
    "selected" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "outcome" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "messageId" TEXT,
    "error" TEXT,
    "replySnippet" TEXT,
    "outcomeAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailCampaignRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailSuppression" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MailSuppression_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MailCampaign_userId_idx" ON "MailCampaign"("userId");

-- CreateIndex
CREATE INDEX "MailCampaign_status_idx" ON "MailCampaign"("status");

-- CreateIndex
CREATE INDEX "MailCampaignRecipient_campaignId_status_idx" ON "MailCampaignRecipient"("campaignId", "status");

-- CreateIndex
CREATE INDEX "MailCampaignRecipient_messageId_idx" ON "MailCampaignRecipient"("messageId");

-- CreateIndex
CREATE INDEX "MailCampaignRecipient_email_idx" ON "MailCampaignRecipient"("email");

-- CreateIndex
CREATE UNIQUE INDEX "MailCampaignRecipient_campaignId_email_key" ON "MailCampaignRecipient"("campaignId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "MailSuppression_userId_email_key" ON "MailSuppression"("userId", "email");

-- AddForeignKey
ALTER TABLE "MailCampaign" ADD CONSTRAINT "MailCampaign_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailCampaign" ADD CONSTRAINT "MailCampaign_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "MailAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailCampaignRecipient" ADD CONSTRAINT "MailCampaignRecipient_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "MailCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailSuppression" ADD CONSTRAINT "MailSuppression_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
