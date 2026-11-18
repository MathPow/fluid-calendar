-- Envois: answer a reply from the campaign page, in the same thread.
ALTER TABLE "MailCampaignRecipient" ADD COLUMN "replyMessageId" TEXT;
ALTER TABLE "MailCampaignRecipient" ADD COLUMN "replyFrom" TEXT;
ALTER TABLE "MailCampaignRecipient" ADD COLUMN "answeredAt" TIMESTAMP(3);
