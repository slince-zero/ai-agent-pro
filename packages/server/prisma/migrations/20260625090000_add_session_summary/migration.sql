-- CreateTable
CREATE TABLE "SessionSummary" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "coveredMessageCount" INTEGER NOT NULL,
  "coveredThroughMessageId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SessionSummary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SessionSummary_sessionId_coveredMessageCount_idx" ON "SessionSummary"("sessionId", "coveredMessageCount");

-- CreateIndex
CREATE INDEX "SessionSummary_sessionId_updatedAt_idx" ON "SessionSummary"("sessionId", "updatedAt");

-- AddForeignKey
ALTER TABLE "SessionSummary" ADD CONSTRAINT "SessionSummary_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
