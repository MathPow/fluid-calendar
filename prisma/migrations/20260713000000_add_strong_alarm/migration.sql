-- AlterTable
ALTER TABLE "CalendarEvent" ADD COLUMN     "strongAlarm" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "alarmMinutes" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "alarmArmedAt" TIMESTAMP(3);
