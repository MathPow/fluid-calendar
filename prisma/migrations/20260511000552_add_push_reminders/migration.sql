-- AlterTable
ALTER TABLE "NotificationSettings" ADD COLUMN     "pushReminderMinutes" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "pushRemindersEnabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "SentPushReminder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "reminderMinutes" INTEGER NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SentPushReminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SentPushReminder_userId_idx" ON "SentPushReminder"("userId");

-- CreateIndex
CREATE INDEX "SentPushReminder_sentAt_idx" ON "SentPushReminder"("sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "SentPushReminder_userId_eventId_reminderMinutes_key" ON "SentPushReminder"("userId", "eventId", "reminderMinutes");
