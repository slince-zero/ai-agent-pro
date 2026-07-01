CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE "DocumentChunk" ADD COLUMN "embedding" vector(1536);

CREATE INDEX "DocumentChunk_embedding_ivfflat_idx"
  ON "DocumentChunk"
  USING ivfflat ("embedding" vector_cosine_ops)
  WITH (lists = 100)
  WHERE "embedding" IS NOT NULL;
