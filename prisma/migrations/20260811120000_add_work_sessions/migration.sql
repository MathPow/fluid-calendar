-- CreateTable
CREATE TABLE "WorkSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "lexicon" TEXT,
    "language" TEXT,
    "model" TEXT,
    "brief" TEXT,
    "targets" JSONB,
    "digest" TEXT,
    "toc" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "statusError" TEXT,
    "compiledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TranscriptSegment" (
    "id" TEXT NOT NULL,
    "recordingId" TEXT NOT NULL,
    "idx" INTEGER NOT NULL,
    "startSec" DOUBLE PRECISION NOT NULL,
    "endSec" DOUBLE PRECISION NOT NULL,
    "text" TEXT NOT NULL,

    CONSTRAINT "TranscriptSegment_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Recording" ADD COLUMN     "sessionId" TEXT,
ADD COLUMN     "orderIndex" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "WorkSession_userId_createdAt_idx" ON "WorkSession"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "WorkSession_status_idx" ON "WorkSession"("status");

-- CreateIndex
CREATE UNIQUE INDEX "TranscriptSegment_recordingId_idx_key" ON "TranscriptSegment"("recordingId", "idx");

-- CreateIndex
CREATE INDEX "TranscriptSegment_recordingId_startSec_idx" ON "TranscriptSegment"("recordingId", "startSec");

-- CreateIndex
CREATE INDEX "Recording_sessionId_orderIndex_idx" ON "Recording"("sessionId", "orderIndex");

-- AddForeignKey
ALTER TABLE "WorkSession" ADD CONSTRAINT "WorkSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TranscriptSegment" ADD CONSTRAINT "TranscriptSegment_recordingId_fkey" FOREIGN KEY ("recordingId") REFERENCES "Recording"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recording" ADD CONSTRAINT "Recording_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "WorkSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Full-text search over transcript segments. Prisma can't express a functional
-- index, so it's declared here. 'french' is a built-in Postgres text search
-- config (stemming + stopwords), which is what makes searching a French call
-- transcript actually work — 'simple' would miss every inflected form.
CREATE INDEX "TranscriptSegment_text_fts_idx"
    ON "TranscriptSegment" USING GIN (to_tsvector('french', "text"));
