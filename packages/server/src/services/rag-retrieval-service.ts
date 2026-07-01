import type OpenAI from 'openai'

import { prisma } from '../db/client.js'
import { EMBEDDING_MODEL, createOpenAIEmbeddingClient } from './openai.js'

const DEFAULT_RETRIEVAL_LIMIT = 5
const MAX_RETRIEVAL_LIMIT = 20
const VECTOR_DIMENSIONS = 1536

export type EmbeddingClient = {
  embedText: (input: { signal?: AbortSignal; text: string }) => Promise<number[]>
}

type RagRetrievalDb = {
  $queryRawUnsafe: <T = unknown>(query: string, ...values: unknown[]) => Promise<T>
}

export type CreateRagRetrievalServiceDeps = {
  db?: RagRetrievalDb
  embeddingClient?: EmbeddingClient | null
}

export type SearchRelevantChunksInput = {
  limit?: number
  projectId?: string
  query: string
  queryEmbedding?: number[]
  signal?: AbortSignal
  userId: string
}

type RawRelevantChunk = {
  chunkId: string
  chunkIndex: number
  content: string
  documentId: string
  metadata: unknown
  projectId: string | null
  score: number | null
  sourceRef: string | null
  title: string
  uri: string | null
}

export type RelevantDocumentChunk = {
  chunkId: string
  chunkIndex: number
  content: string
  documentId: string
  metadata: unknown
  projectId: string | null
  score: number | null
  sourceRef: string | null
  title: string
  uri: string | null
}

function assertNonEmpty(value: string | undefined | null, field: string) {
  if (!value || !value.trim()) {
    throw new Error(`${field} is required`)
  }
}

function normalizeLimit(limit: number | undefined) {
  if (!Number.isFinite(limit) || limit == null) return DEFAULT_RETRIEVAL_LIMIT

  const normalized = Math.floor(limit)
  if (normalized <= 0) return DEFAULT_RETRIEVAL_LIMIT
  return Math.min(normalized, MAX_RETRIEVAL_LIMIT)
}

function normalizeQuery(query: string) {
  return query.replace(/\s+/g, ' ').trim()
}

function normalizeProjectId(projectId: string | undefined) {
  const normalized = projectId?.trim()
  return normalized || null
}

function normalizeEmbedding(embedding: number[]) {
  if (embedding.length !== VECTOR_DIMENSIONS) {
    throw new Error(`queryEmbedding must contain ${VECTOR_DIMENSIONS} dimensions`)
  }

  return embedding.map((value) => {
    if (!Number.isFinite(value)) {
      throw new Error('queryEmbedding must contain only finite numbers')
    }
    return Number(value)
  })
}

function toVectorLiteral(embedding: number[]) {
  return `[${normalizeEmbedding(embedding).join(',')}]`
}

function toTextPattern(query: string) {
  return `%${query.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`
}

function serializeRelevantChunk(chunk: RawRelevantChunk): RelevantDocumentChunk {
  return {
    chunkId: chunk.chunkId,
    documentId: chunk.documentId,
    chunkIndex: chunk.chunkIndex,
    content: chunk.content,
    sourceRef: chunk.sourceRef,
    metadata: chunk.metadata,
    title: chunk.title,
    uri: chunk.uri,
    projectId: chunk.projectId,
    score: chunk.score == null ? null : Number(chunk.score),
  }
}

async function searchByEmbedding(
  db: RagRetrievalDb,
  input: {
    limit: number
    projectId: string | null
    queryEmbedding: number[]
    userId: string
  },
) {
  const rows = await db.$queryRawUnsafe<RawRelevantChunk[]>(
    `
      SELECT
        c."id" AS "chunkId",
        c."documentId" AS "documentId",
        c."chunkIndex" AS "chunkIndex",
        c."content" AS "content",
        c."sourceRef" AS "sourceRef",
        c."metadata" AS "metadata",
        d."title" AS "title",
        d."uri" AS "uri",
        d."projectId" AS "projectId",
        (1 - (c."embedding" <=> $3::vector))::float AS "score"
      FROM "DocumentChunk" c
      JOIN "Document" d ON d."id" = c."documentId"
      WHERE d."userId" = $1
        AND d."status" = 'active'::"DocumentStatus"
        AND ($2::text IS NULL OR d."projectId" = $2)
        AND c."embedding" IS NOT NULL
      ORDER BY c."embedding" <=> $3::vector
      LIMIT $4
    `,
    input.userId,
    input.projectId,
    toVectorLiteral(input.queryEmbedding),
    input.limit,
  )

  return rows.map(serializeRelevantChunk)
}

async function searchByText(
  db: RagRetrievalDb,
  input: {
    limit: number
    projectId: string | null
    query: string
    userId: string
  },
) {
  const rows = await db.$queryRawUnsafe<RawRelevantChunk[]>(
    `
      SELECT
        c."id" AS "chunkId",
        c."documentId" AS "documentId",
        c."chunkIndex" AS "chunkIndex",
        c."content" AS "content",
        c."sourceRef" AS "sourceRef",
        c."metadata" AS "metadata",
        d."title" AS "title",
        d."uri" AS "uri",
        d."projectId" AS "projectId",
        0::float AS "score"
      FROM "DocumentChunk" c
      JOIN "Document" d ON d."id" = c."documentId"
      WHERE d."userId" = $1
        AND d."status" = 'active'::"DocumentStatus"
        AND ($2::text IS NULL OR d."projectId" = $2)
        AND (
          c."content" ILIKE $3 ESCAPE '\\'
          OR d."title" ILIKE $3 ESCAPE '\\'
          OR COALESCE(c."sourceRef", '') ILIKE $3 ESCAPE '\\'
        )
      ORDER BY d."updatedAt" DESC, c."chunkIndex" ASC
      LIMIT $4
    `,
    input.userId,
    input.projectId,
    toTextPattern(input.query),
    input.limit,
  )

  return rows.map(serializeRelevantChunk)
}

export function createOpenAICompatibleEmbeddingClient({
  model = EMBEDDING_MODEL,
  openai = createOpenAIEmbeddingClient(),
}: {
  model?: string
  openai?: OpenAI
} = {}): EmbeddingClient {
  return {
    async embedText({ text, signal }) {
      const response = await openai.embeddings.create(
        {
          model,
          input: text,
        },
        { signal },
      )

      return response.data[0]?.embedding ?? []
    },
  }
}

export function createRagRetrievalService({
  db = prisma as unknown as RagRetrievalDb,
  embeddingClient = createOpenAICompatibleEmbeddingClient(),
}: CreateRagRetrievalServiceDeps = {}) {
  return {
    async searchRelevantChunks(input: SearchRelevantChunksInput) {
      assertNonEmpty(input.userId, 'userId')

      const query = normalizeQuery(input.query)
      if (!query) return []

      const limit = normalizeLimit(input.limit)
      const projectId = normalizeProjectId(input.projectId)
      let queryEmbedding = input.queryEmbedding

      if (!queryEmbedding && embeddingClient) {
        try {
          queryEmbedding = await embeddingClient.embedText({
            text: query,
            signal: input.signal,
          })
        } catch {
          queryEmbedding = undefined
        }
      }

      if (queryEmbedding) {
        const vectorResults = await searchByEmbedding(db, {
          userId: input.userId,
          projectId,
          queryEmbedding,
          limit,
        })
        if (vectorResults.length > 0) return vectorResults
      }

      return searchByText(db, {
        userId: input.userId,
        projectId,
        query,
        limit,
      })
    },
  }
}

export type RagRetrievalService = ReturnType<typeof createRagRetrievalService>
