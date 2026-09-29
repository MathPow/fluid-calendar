-- CreateTable
CREATE TABLE "TaskStep" (
  "id" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "done" BOOLEAN NOT NULL DEFAULT false,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TaskStep_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TaskStep_taskId_sortOrder_idx" ON "TaskStep"("taskId", "sortOrder");
ALTER TABLE "TaskStep"
  ADD CONSTRAINT "TaskStep_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
