import assert from 'node:assert/strict'
import { test } from 'node:test'

process.env.OPENAI_API_KEY = 'test-api-key'
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test'

const { createOpenAICompatibleEmbeddingClient, createRagRetrievalService } =
  await import('./rag-retrieval-service.js')

function createEmbedding(dimensions = 1536) {
  return Array.from({ length: dimensions }, (_value, index) => index / dimensions)
}

function createRawChunk(overrides: Record<string, unknown> = {}) {
  return {
    chunkId: 'chunk_1',
    documentId: 'document_1',
    chunkIndex: 0,
    content: 'Use pnpm for package scripts.',
    sourceRef: 'README.md#L1-L3',
    metadata: { path: 'README.md' },
    title: 'README.md',
    uri: 'https://github.com/slince-zero/ai-agent-pro/blob/main/README.md',
    projectId: 'slince-zero/ai-agent-pro',
    score: 0.91,
    ...overrides,
  }
}

function createFakeDb(rows: unknown[]) {
  const queries: { sql: string; values: unknown[] }[] = []
  const db = {
    $queryRawUnsafe: async <T>(sql: string, ...values: unknown[]) => {
      queries.push({ sql, values })
      return rows as T
    },
  }

  return { db, queries }
}

test('searches relevant chunks with pgvector when an embedding is available', async () => {
  const { db, queries } = createFakeDb([createRawChunk()])
  const service = createRagRetrievalService({
    db,
    embeddingClient: null,
  })

  const results = await service.searchRelevantChunks({
    userId: 'user_1',
    projectId: 'slince-zero/ai-agent-pro',
    query: 'package scripts',
    queryEmbedding: createEmbedding(),
    limit: 3,
  })

  assert.equal(queries.length, 1)
  assert.match(queries[0]!.sql, /<=> \$3::vector/)
  assert.deepEqual(queries[0]!.values.slice(0, 2), ['user_1', 'slince-zero/ai-agent-pro'])
  assert.match(queries[0]!.values[2] as string, /^\[0,/)
  assert.equal(queries[0]!.values[3], 3)
  assert.deepEqual(results[0], {
    chunkId: 'chunk_1',
    documentId: 'document_1',
    chunkIndex: 0,
    content: 'Use pnpm for package scripts.',
    sourceRef: 'README.md#L1-L3',
    metadata: { path: 'README.md' },
    title: 'README.md',
    uri: 'https://github.com/slince-zero/ai-agent-pro/blob/main/README.md',
    projectId: 'slince-zero/ai-agent-pro',
    score: 0.91,
  })
})

test('falls back to text search when embedding generation fails', async () => {
  const { db, queries } = createFakeDb([createRawChunk({ score: 0 })])
  const service = createRagRetrievalService({
    db,
    embeddingClient: {
      embedText: async () => {
        throw new Error('embedding service unavailable')
      },
    },
  })

  const results = await service.searchRelevantChunks({
    userId: 'user_1',
    query: 'pnpm',
  })

  assert.equal(queries.length, 1)
  assert.match(queries[0]!.sql, /ILIKE \$3/)
  assert.deepEqual(queries[0]!.values, ['user_1', null, '%pnpm%', 5])
  assert.equal(results[0]?.score, 0)
})

test('validates explicit query embeddings before vector search', async () => {
  const { db } = createFakeDb([])
  const service = createRagRetrievalService({
    db,
    embeddingClient: null,
  })

  await assert.rejects(
    () =>
      service.searchRelevantChunks({
        userId: 'user_1',
        query: 'pnpm',
        queryEmbedding: [1, 2, 3],
      }),
    /1536 dimensions/,
  )
})

test('converts text into OpenAI-compatible embedding requests', async () => {
  const requests: { body: unknown; signal?: AbortSignal }[] = []
  const openai = {
    embeddings: {
      create: async (body: unknown, options?: { signal?: AbortSignal }) => {
        requests.push({ body, signal: options?.signal })
        return {
          data: [{ embedding: [0.1, 0.2, 0.3] }],
        }
      },
    },
  }
  const controller = new AbortController()
  const client = createOpenAICompatibleEmbeddingClient({
    openai: openai as never,
    model: 'text-embedding-test',
  })

  const embedding = await client.embedText({
    text: 'Find package scripts',
    signal: controller.signal,
  })

  assert.deepEqual(embedding, [0.1, 0.2, 0.3])
  assert.deepEqual(requests, [
    {
      body: {
        model: 'text-embedding-test',
        input: 'Find package scripts',
      },
      signal: controller.signal,
    },
  ])
})
