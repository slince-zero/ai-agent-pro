CREATE TABLE "Citation" (
  "id" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "documentId" TEXT,
  "documentChunkId" TEXT,
  "title" TEXT NOT NULL,
  "uri" TEXT,
  "sourceRef" TEXT,
  "snippet" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Citation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Citation_messageId_idx" ON "Citation"("messageId");
CREATE INDEX "Citation_documentId_idx" ON "Citation"("documentId");
CREATE INDEX "Citation_documentChunkId_idx" ON "Citation"("documentChunkId");

ALTER TABLE "Citation"
  ADD CONSTRAINT "Citation_messageId_fkey"
  FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Citation"
  ADD CONSTRAINT "Citation_documentId_fkey"
  FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Citation"
  ADD CONSTRAINT "Citation_documentChunkId_fkey"
  FOREIGN KEY ("documentChunkId") REFERENCES "DocumentChunk"("id") ON DELETE SET NULL ON UPDATE CASCADE;
