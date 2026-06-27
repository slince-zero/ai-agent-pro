import assert from 'node:assert/strict'
import { test } from 'node:test'

process.env.OPENAI_API_KEY = 'test-api-key'
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test'

const { MemoryScope, MemoryStatus } = await import('../generated/prisma/client.js')
const { MEMORY_WRITE_TRIGGERS, createMemoryService } = await import('./memory-service.js')

const createdAt = new Date('2026-06-24T08:00:00.000Z')
const updatedAt = new Date('2026-06-24T08:01:00.000Z')

function createMemoryRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'memory_1',
    userId: 'user_1',
    sessionId: null,
    projectId: null,
    scope: MemoryScope.USER,
    content: 'Remember this preference.',
    metadata: null,
    status: MemoryStatus.ACTIVE,
    createdAt,
    updatedAt,
    invalidatedAt: null,
    ...overrides,
  }
}

function createFakeDb() {
  const calls: {
    creates: unknown[]
    updates: unknown[]
    queries: unknown[]
  } = {
    creates: [],
    updates: [],
    queries: [],
  }

  const db = {
    memory: {
      create: async (args: unknown) => {
        calls.creates.push(args)
        const data = (args as { data: Record<string, unknown> }).data
        return createMemoryRecord({
          ...data,
          id: 'memory_created',
          createdAt,
          updatedAt,
          invalidatedAt: null,
          status: data.status ?? MemoryStatus.ACTIVE,
        })
      },
      findMany: async (args: unknown) => {
        calls.queries.push(args)
        return [
          createMemoryRecord({
            id: 'memory_project',
            scope: MemoryScope.PROJECT,
            projectId: 'repo_1',
            content: 'Use pnpm for this repository.',
          }),
        ]
      },
      update: async (args: unknown) => {
        calls.updates.push(args)
        const data = (args as { data: Record<string, unknown> }).data
        return createMemoryRecord({
          ...data,
          metadata: data.metadata ?? { source: 'existing' },
          invalidatedAt: (data.invalidatedAt as Date | undefined) ?? null,
          updatedAt: (data.updatedAt as Date | undefined) ?? updatedAt,
        })
      },
    },
  }

  return { calls, db }
}

test('documents explicit memory write triggers', () => {
  assert.deepEqual(MEMORY_WRITE_TRIGGERS, [
    'memoryService.createMemory',
    'memoryService.updateMemory',
    'memoryService.invalidateMemory',
  ])
})

test('creates scoped memories with normalized content and metadata', async () => {
  const { calls, db } = createFakeDb()
  const service = createMemoryService({ db })

  const memory = await service.createMemory({
    userId: 'user_1',
    scope: 'session',
    sessionId: 'session_1',
    content: '  Remember   that tests use node:test. ',
    metadata: { source: 'manual' },
  })

  assert.deepEqual(memory, {
    id: 'memory_created',
    userId: 'user_1',
    scope: 'session',
    sessionId: 'session_1',
    projectId: null,
    content: 'Remember that tests use node:test.',
    metadata: { source: 'manual' },
    status: 'active',
    createdAt: createdAt.toISOString(),
    updatedAt: updatedAt.toISOString(),
    invalidatedAt: null,
  })
  assert.deepEqual(calls.creates[0], {
    data: {
      userId: 'user_1',
      scope: MemoryScope.SESSION,
      sessionId: 'session_1',
      projectId: null,
      content: 'Remember that tests use node:test.',
      metadata: { source: 'manual' },
    },
  })
})

test('rejects invalid memory scope payloads', async () => {
  const { db } = createFakeDb()
  const service = createMemoryService({ db })

  await assert.rejects(
    () =>
      service.createMemory({
        userId: 'user_1',
        scope: 'user',
        sessionId: 'session_1',
        content: 'Should fail.',
      }),
    /user memory cannot include sessionId or projectId/,
  )
  await assert.rejects(
    () =>
      service.createMemory({
        userId: 'user_1',
        scope: 'project',
        content: 'Should fail.',
      }),
    /projectId is required/,
  )
  await assert.rejects(
    () =>
      service.createMemory({
        userId: 'user_1',
        scope: 'session',
        sessionId: 'session_1',
        content: '   ',
      }),
    /content is required/,
  )
})

test('lists active memories with deterministic filters and limits', async () => {
  const { calls, db } = createFakeDb()
  const service = createMemoryService({ db })

  const memories = await service.listMemories({
    userId: 'user_1',
    scope: 'project',
    projectId: 'repo_1',
    query: ' pnpm ',
    limit: 200,
  })

  assert.equal(memories[0]?.id, 'memory_project')
  assert.deepEqual(calls.queries[0], {
    where: {
      userId: 'user_1',
      status: MemoryStatus.ACTIVE,
      scope: MemoryScope.PROJECT,
      projectId: 'repo_1',
      content: {
        contains: 'pnpm',
        mode: 'insensitive',
      },
    },
    orderBy: {
      updatedAt: 'desc',
    },
    take: 100,
  })
})

test('lists context memories across user, session and project scopes', async () => {
  const { calls, db } = createFakeDb()
  const service = createMemoryService({ db })

  await service.listContextMemories({
    userId: 'user_1',
    sessionId: 'session_1',
    projectId: 'repo_1',
    limit: 5,
  })

  assert.deepEqual(calls.queries[0], {
    where: {
      userId: 'user_1',
      status: MemoryStatus.ACTIVE,
      OR: [
        { scope: MemoryScope.USER },
        { scope: MemoryScope.SESSION, sessionId: 'session_1' },
        { scope: MemoryScope.PROJECT, projectId: 'repo_1' },
      ],
    },
    orderBy: {
      updatedAt: 'desc',
    },
    take: 5,
  })
})

test('updates active memories for the owning user', async () => {
  const { calls, db } = createFakeDb()
  const service = createMemoryService({ db })

  const memory = await service.updateMemory({
    userId: 'user_1',
    memoryId: 'memory_1',
    content: '  Updated memory. ',
    metadata: { source: 'edited' },
  })

  assert.equal(memory.content, 'Updated memory.')
  assert.deepEqual(memory.metadata, { source: 'edited' })
  assert.deepEqual((calls.updates[0] as { where: unknown }).where, {
    id: 'memory_1',
    userId: 'user_1',
    status: MemoryStatus.ACTIVE,
  })
  assert.equal(
    (calls.updates[0] as { data: { updatedAt: unknown } }).data.updatedAt instanceof Date,
    true,
  )
})

test('invalidates active memories without deleting them', async () => {
  const { calls, db } = createFakeDb()
  const service = createMemoryService({ db })

  const memory = await service.invalidateMemory({
    userId: 'user_1',
    memoryId: 'memory_1',
  })

  assert.equal(memory.status, 'invalidated')
  assert.ok(memory.invalidatedAt)
  assert.deepEqual(
    (calls.updates[0] as { data: { status: unknown } }).data.status,
    MemoryStatus.INVALIDATED,
  )
})
