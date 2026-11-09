ALTER TABLE "MailCampaign" ADD COLUMN "notBefore" TIMESTAMP(3);
ALTER TABLE "MailCampaignRecipient" ADD COLUMN "inReplyTo" TEXT;
