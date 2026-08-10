ALTER TABLE "Session" ADD COLUMN "projectId" TEXT;

CREATE INDEX "Session_userId_projectId_updatedAt_idx"
ON "Session"("userId", "projectId", "updatedAt");
