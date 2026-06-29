CREATE TYPE "DocumentSource" AS ENUM ('text', 'github', 'url', 'file');

CREATE TYPE "DocumentStatus" AS ENUM ('active', 'archived');

CREATE TABLE "Document" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "projectId" TEXT,
  "source" "DocumentSource" NOT NULL,
  "externalId" TEXT,
  "title" TEXT NOT NULL,
  "uri" TEXT,
  "mimeType" TEXT,
  "contentHash" TEXT,
  "metadata" JSONB,
  "status" "DocumentStatus" NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DocumentChunk" (
  "id" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "chunkIndex" INTEGER NOT NULL,
  "content" TEXT NOT NULL,
  "contentHash" TEXT,
  "sourceRef" TEXT,
  "startOffset" INTEGER,
  "endOffset" INTEGER,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "DocumentChunk_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Document_userId_status_updatedAt_idx" ON "Document"("userId", "status", "updatedAt");
CREATE INDEX "Document_projectId_source_updatedAt_idx" ON "Document"("projectId", "source", "updatedAt");
CREATE INDEX "Document_source_externalId_idx" ON "Document"("source", "externalId");

CREATE UNIQUE INDEX "DocumentChunk_documentId_chunkIndex_key" ON "DocumentChunk"("documentId", "chunkIndex");
CREATE INDEX "DocumentChunk_documentId_chunkIndex_idx" ON "DocumentChunk"("documentId", "chunkIndex");
CREATE INDEX "DocumentChunk_contentHash_idx" ON "DocumentChunk"("contentHash");

ALTER TABLE "Document" ADD CONSTRAINT "Document_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DocumentChunk" ADD CONSTRAINT "DocumentChunk_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
