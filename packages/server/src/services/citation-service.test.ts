import assert from 'node:assert/strict'
import { test } from 'node:test'

process.env.OPENAI_API_KEY = 'test-api-key'
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test'

const { createCitationService, normalizeCitationSources } = await import('./citation-service.js')

test('normalizes retrieved chunks into bounded citations', () => {
  const citations = normalizeCitationSources([
    {
      chunkId: ' chunk_1 ',
      documentId: ' doc_1 ',
      title: ' README.md ',
      uri: ' https://github.com/example/repo/blob/main/README.md ',
      sourceRef: ' README.md#L1-L3 ',
      content: ` ${'Use pnpm test before opening PRs. '.repeat(20)} `,
      chunkIndex: 0,
      projectId: 'repo_1',
      score: 0.82,
    },
    {
      chunkId: 'chunk_1',
      documentId: 'doc_1',
      title: 'Duplicate',
      content: 'Duplicate source.',
    },
    {
      content: '   ',
    },
  ])

  assert.equal(citations.length, 1)
  assert.equal(citations[0]?.documentId, 'doc_1')
  assert.equal(citations[0]?.documentChunkId, 'chunk_1')
  assert.equal(citations[0]?.title, 'README.md')
  assert.equal(citations[0]?.sourceRef, 'README.md#L1-L3')
  assert.ok((citations[0]?.snippet.length ?? 0) <= 280)
  assert.deepEqual(citations[0]?.metadata, {
    chunkIndex: 0,
    projectId: 'repo_1',
    score: 0.82,
  })
})

test('creates message citations and serializes records', async () => {
  const created: unknown[] = []
  const deleted: unknown[] = []
  const service = createCitationService({
    db: {
      citation: {
        create: async (args: unknown) => {
          created.push(args)
          const data = (args as { data: Record<string, unknown> }).data
          return {
            id: 'citation_1',
            messageId: data.messageId as string,
            documentId: data.documentId as string | null,
            documentChunkId: data.documentChunkId as string | null,
            title: data.title as string,
            uri: data.uri as string | null,
            sourceRef: data.sourceRef as string | null,
            snippet: data.snippet as string,
            metadata: data.metadata as null,
            createdAt: new Date('2026-07-03T09:00:00.000Z'),
          }
        },
        deleteMany: async (args: unknown) => {
          deleted.push(args)
          return { count: 1 }
        },
      },
    },
  })

  const citations = await service.createMessageCitations({
    messageId: 'msg_1',
    sources: [
      {
        chunkId: 'chunk_1',
        documentId: 'doc_1',
        title: 'README.md',
        uri: 'https://github.com/example/repo/blob/main/README.md',
        sourceRef: 'README.md#L1-L3',
        content: 'Use pnpm test before opening PRs.',
      },
    ],
  })

  assert.equal(created.length, 1)
  assert.deepEqual((created[0] as { data: unknown }).data, {
    messageId: 'msg_1',
    documentId: 'doc_1',
    documentChunkId: 'chunk_1',
    title: 'README.md',
    uri: 'https://github.com/example/repo/blob/main/README.md',
    sourceRef: 'README.md#L1-L3',
    snippet: 'Use pnpm test before opening PRs.',
    metadata: {
      chunkIndex: null,
      projectId: null,
      score: null,
    },
  })
  assert.deepEqual(citations, [
    {
      id: 'citation_1',
      messageId: 'msg_1',
      documentId: 'doc_1',
      chunkId: 'chunk_1',
      title: 'README.md',
      uri: 'https://github.com/example/repo/blob/main/README.md',
      sourceRef: 'README.md#L1-L3',
      snippet: 'Use pnpm test before opening PRs.',
      metadata: {
        chunkIndex: null,
        projectId: null,
        score: null,
      },
      createdAt: '2026-07-03T09:00:00.000Z',
    },
  ])
  assert.deepEqual(deleted, [])

  await service.replaceMessageCitations({
    messageId: 'msg_1',
    sources: [
      {
        chunkId: 'chunk_2',
        documentId: 'doc_1',
        title: 'README.md',
        content: 'Updated answer source.',
      },
    ],
  })

  assert.deepEqual(deleted, [
    {
      where: {
        messageId: 'msg_1',
      },
    },
  ])
})
