import assert from 'node:assert/strict'
import { test } from 'node:test'

process.env.OPENAI_API_KEY = 'test-api-key'
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test'

const { DocumentSource, DocumentStatus, Prisma } = await import('../generated/prisma/client.js')
const { createDocumentService } = await import('./document-service.js')

const createdAt = new Date('2026-06-28T08:00:00.000Z')
const updatedAt = new Date('2026-06-28T08:01:00.000Z')

function createDocumentRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'document_1',
    userId: 'user_1',
    projectId: null,
    source: DocumentSource.TEXT,
    externalId: null,
    title: 'Project notes',
    uri: null,
    mimeType: 'text/plain',
    contentHash: null,
    metadata: null,
    status: DocumentStatus.ACTIVE,
    createdAt,
    updatedAt,
    ...overrides,
  }
}

function createChunkRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'chunk_1',
    documentId: 'document_1',
    chunkIndex: 0,
    content: 'Chunk content',
    contentHash: null,
    sourceRef: 'README.md#L1-L5',
    startOffset: 0,
    endOffset: 120,
    metadata: null,
    createdAt,
    updatedAt,
    ...overrides,
  }
}

function createFakeDb() {
  const calls: {
    creates: unknown[]
    documentQueries: unknown[]
    updates: unknown[]
    chunkQueries: unknown[]
  } = {
    creates: [],
    documentQueries: [],
    updates: [],
    chunkQueries: [],
  }

  const db = {
    document: {
      create: async (args: unknown) => {
        calls.creates.push(args)
        const data = (args as { data: Record<string, unknown> }).data
        return createDocumentRecord({
          ...data,
          id: 'document_created',
          createdAt,
          updatedAt,
          status: data.status ?? DocumentStatus.ACTIVE,
        })
      },
      findMany: async (args: unknown) => {
        calls.documentQueries.push(args)
        return [createDocumentRecord()]
      },
      update: async (args: unknown) => {
        calls.updates.push(args)
        const data = (args as { data: { chunks: { createMany: { data: unknown[] } } } }).data
        return createDocumentRecord({
          chunks: data.chunks.createMany.data.map((chunk, index) =>
            createChunkRecord({
              ...(chunk as Record<string, unknown>),
              id: `chunk_${index + 1}`,
            }),
          ),
        })
      },
    },
    documentChunk: {
      findMany: async (args: unknown) => {
        calls.chunkQueries.push(args)
        return [createChunkRecord()]
      },
    },
  }

  return { calls, db }
}

test('creates citation-ready document records with normalized metadata', async () => {
  const { calls, db } = createFakeDb()
  const service = createDocumentService({ db })

  const document = await service.createDocument({
    userId: 'user_1',
    projectId: 'repo_1',
    source: 'github',
    externalId: 'slince-zero/ai-agent-pro:README.md',
    title: '  README   ',
    uri: ' https://github.com/slince-zero/ai-agent-pro/blob/main/README.md ',
    mimeType: ' text/markdown ',
    contentHash: ' sha256:abc ',
    metadata: { branch: 'main', path: 'README.md' },
  })

  assert.deepEqual(document, {
    id: 'document_created',
    userId: 'user_1',
    projectId: 'repo_1',
    source: 'github',
    externalId: 'slince-zero/ai-agent-pro:README.md',
    title: 'README',
    uri: 'https://github.com/slince-zero/ai-agent-pro/blob/main/README.md',
    mimeType: 'text/markdown',
    contentHash: 'sha256:abc',
    metadata: { branch: 'main', path: 'README.md' },
    status: 'active',
    createdAt: createdAt.toISOString(),
    updatedAt: updatedAt.toISOString(),
  })
  assert.deepEqual(calls.creates[0], {
    data: {
      userId: 'user_1',
      projectId: 'repo_1',
      source: DocumentSource.GITHUB,
      externalId: 'slince-zero/ai-agent-pro:README.md',
      title: 'README',
      uri: 'https://github.com/slince-zero/ai-agent-pro/blob/main/README.md',
      mimeType: 'text/markdown',
      contentHash: 'sha256:abc',
      metadata: { branch: 'main', path: 'README.md' },
    },
  })
})

test('lists active documents with deterministic filters and limits', async () => {
  const { calls, db } = createFakeDb()
  const service = createDocumentService({ db })

  await service.listDocuments({
    userId: 'user_1',
    projectId: 'repo_1',
    source: 'github',
    query: ' readme ',
    limit: 200,
  })

  assert.deepEqual(calls.documentQueries[0], {
    where: {
      userId: 'user_1',
      status: DocumentStatus.ACTIVE,
      projectId: 'repo_1',
      source: DocumentSource.GITHUB,
      title: {
        contains: 'readme',
        mode: 'insensitive',
      },
    },
    orderBy: {
      updatedAt: 'desc',
    },
    take: 100,
  })
})

test('replaces document chunks with ordered citation metadata', async () => {
  const { calls, db } = createFakeDb()
  const service = createDocumentService({ db })

  const document = await service.replaceDocumentChunks({
    userId: 'user_1',
    documentId: 'document_1',
    chunks: [
      {
        content: '  First chunk.  ',
        contentHash: ' hash-1 ',
        sourceRef: ' README.md#L1-L5 ',
        startOffset: 0,
        endOffset: 20,
        metadata: { lineStart: 1, lineEnd: 5 },
      },
      {
        chunkIndex: 3,
        content: 'Second chunk.',
      },
    ],
  })

  assert.equal((document as { chunks?: unknown[] }).chunks?.length, 2)
  assert.deepEqual(calls.updates[0], {
    where: {
      id: 'document_1',
      userId: 'user_1',
      status: DocumentStatus.ACTIVE,
    },
    data: {
      updatedAt: (calls.updates[0] as { data: { updatedAt: Date } }).data.updatedAt,
      chunks: {
        deleteMany: {},
        createMany: {
          data: [
            {
              chunkIndex: 0,
              content: 'First chunk.',
              contentHash: 'hash-1',
              sourceRef: 'README.md#L1-L5',
              startOffset: 0,
              endOffset: 20,
              metadata: { lineStart: 1, lineEnd: 5 },
            },
            {
              chunkIndex: 3,
              content: 'Second chunk.',
              contentHash: null,
              sourceRef: null,
              startOffset: null,
              endOffset: null,
              metadata: Prisma.JsonNull,
            },
          ],
        },
      },
    },
    include: {
      chunks: {
        orderBy: {
          chunkIndex: 'asc',
        },
      },
    },
  })
  assert.equal(
    (calls.updates[0] as { data: { updatedAt: unknown } }).data.updatedAt instanceof Date,
    true,
  )
})

test('rejects invalid chunk payloads before writing', async () => {
  const { calls, db } = createFakeDb()
  const service = createDocumentService({ db })

  await assert.rejects(
    () =>
      service.replaceDocumentChunks({
        userId: 'user_1',
        documentId: 'document_1',
        chunks: [],
      }),
    /chunks are required/,
  )
  await assert.rejects(
    () =>
      service.replaceDocumentChunks({
        userId: 'user_1',
        documentId: 'document_1',
        chunks: [
          { chunkIndex: 0, content: 'First' },
          { chunkIndex: 0, content: 'Duplicate' },
        ],
      }),
    /chunkIndex values must be unique/,
  )
  await assert.rejects(
    () =>
      service.replaceDocumentChunks({
        userId: 'user_1',
        documentId: 'document_1',
        chunks: [{ content: 'Bad offsets', startOffset: 10, endOffset: 5 }],
      }),
    /endOffset must be greater than or equal to startOffset/,
  )
  assert.equal(calls.updates.length, 0)
})

test('lists chunks through the owning active document', async () => {
  const { calls, db } = createFakeDb()
  const service = createDocumentService({ db })

  await service.listDocumentChunks({
    userId: 'user_1',
    documentId: 'document_1',
    limit: 5,
  })

  assert.deepEqual(calls.chunkQueries[0], {
    where: {
      documentId: 'document_1',
      document: {
        userId: 'user_1',
        status: DocumentStatus.ACTIVE,
      },
    },
    orderBy: {
      chunkIndex: 'asc',
    },
    take: 5,
  })
})
