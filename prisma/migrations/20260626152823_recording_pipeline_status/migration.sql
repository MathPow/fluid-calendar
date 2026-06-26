-- AlterTable
ALTER TABLE "Recording" ADD COLUMN     "language" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'done',
ADD COLUMN     "statusError" TEXT;

-- CreateIndex
CREATE INDEX "Recording_status_idx" ON "Recording"("status");

