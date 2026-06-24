CREATE TYPE "MemoryScope" AS ENUM ('user', 'session', 'project');

CREATE TYPE "MemoryStatus" AS ENUM ('active', 'invalidated');

CREATE TABLE "Memory" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "sessionId" TEXT,
  "projectId" TEXT,
  "scope" "MemoryScope" NOT NULL,
  "content" TEXT NOT NULL,
  "metadata" JSONB,
  "status" "MemoryStatus" NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "invalidatedAt" TIMESTAMP(3),

  CONSTRAINT "Memory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Memory_userId_scope_status_updatedAt_idx" ON "Memory"("userId", "scope", "status", "updatedAt");
CREATE INDEX "Memory_sessionId_status_updatedAt_idx" ON "Memory"("sessionId", "status", "updatedAt");
CREATE INDEX "Memory_projectId_status_updatedAt_idx" ON "Memory"("projectId", "status", "updatedAt");

ALTER TABLE "Memory" ADD CONSTRAINT "Memory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Memory" ADD CONSTRAINT "Memory_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
