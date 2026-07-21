import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { ModelClient, ModelMessage, ModelStreamChunk } from '../runtime/model-client/types.js'

process.env.OPENAI_API_KEY = 'test-api-key'
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test'

const { MessageRole } = await import('../generated/prisma/client.js')
const { createSessionSummaryService } = await import('./session-summary-service.js')

const createdAt = new Date('2026-06-25T08:00:00.000Z')
const updatedAt = new Date('2026-06-25T08:01:00.000Z')

function streamFrom(chunks: ModelStreamChunk[]) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) {
        yield chunk
      }
    },
  }
}

function createFakeModelClient(chunks: ModelStreamChunk[] = []) {
  const requests: { messages: ModelMessage[]; tools: unknown[]; signal: AbortSignal }[] = []
  const modelClient: ModelClient = {
    streamChat: async (request) => {
      requests.push(request)
      return streamFrom(
        chunks.length
          ? chunks
          : [
              {
                choices: [{ delta: { content: 'Compact summary.' }, finishReason: 'stop' }],
              },
            ],
      )
    },
  }

  return { modelClient, requests }
}

function createMessage(index: number) {
  return {
    id: `msg_${index}`,
    role: index % 2 === 0 ? MessageRole.USER : MessageRole.ASSISTANT,
    content: `Message ${index}`,
    createdAt: new Date(createdAt.getTime() + index * 1000),
  }
}

function createSummary(overrides: Record<string, unknown> = {}) {
  return {
    id: 'summary_1',
    sessionId: 'session_1',
    content: 'Previous summary.',
    coveredMessageCount: 3,
    coveredThroughMessageId: 'msg_3',
    createdAt,
    updatedAt,
    ...overrides,
  }
}

function createFakeDb({
  totalMessages = 6,
  latestSummary = null,
}: {
  totalMessages?: number
  latestSummary?: ReturnType<typeof createSummary> | null
} = {}) {
  const calls: {
    counts: unknown[]
    messageQueries: unknown[]
    summaryQueries: unknown[]
    summaryCreates: unknown[]
  } = {
    counts: [],
    messageQueries: [],
    summaryQueries: [],
    summaryCreates: [],
  }
  const messages = Array.from({ length: totalMessages }, (_value, index) =>
    createMessage(index + 1),
  )

  const db = {
    message: {
      count: async (args: unknown) => {
        calls.counts.push(args)
        return totalMessages
      },
      findMany: async (args: unknown) => {
        calls.messageQueries.push(args)
        const take = (args as { take?: number }).take ?? messages.length
        return messages.slice(0, take)
      },
    },
    sessionSummary: {
      findFirst: async (args: unknown) => {
        calls.summaryQueries.push(args)
        return latestSummary
      },
      create: async (args: unknown) => {
        calls.summaryCreates.push(args)
        const data = (args as { data: Record<string, unknown> }).data
        return createSummary({
          ...data,
          id: 'summary_created',
          createdAt,
          updatedAt,
        })
      },
    },
  }

  return { calls, db }
}

test('returns the latest summary content for context injection', async () => {
  const { calls, db } = createFakeDb({
    latestSummary: createSummary({ content: 'Latest summary.' }),
  })
  const service = createSessionSummaryService({ db })

  assert.equal(await service.getLatestSummaryContent('user_1', 'session_1'), 'Latest summary.')
  assert.deepEqual(calls.summaryQueries[0], {
    where: {
      sessionId: 'session_1',
      session: {
        userId: 'user_1',
      },
    },
    orderBy: [{ coveredMessageCount: 'desc' }, { createdAt: 'desc' }],
  })
})

test('skips summary generation below the message threshold', async () => {
  const { calls, db } = createFakeDb({ totalMessages: 3 })
  const { modelClient, requests } = createFakeModelClient()
  const service = createSessionSummaryService({
    db,
    options: {
      minMessages: 5,
      retainRecentMessages: 2,
      minNewMessages: 2,
    },
  })

  const result = await service.maybeRefreshSessionSummary({
    userId: 'user_1',
    sessionId: 'session_1',
    modelClient,
    signal: new AbortController().signal,
  })

  assert.deepEqual(result, { created: false, reason: 'below_threshold' })
  assert.deepEqual(calls.counts[0], {
    where: {
      sessionId: 'session_1',
      session: {
        userId: 'user_1',
      },
      role: {
        in: [MessageRole.USER, MessageRole.ASSISTANT],
      },
    },
  })
  assert.equal(requests.length, 0)
  assert.equal(calls.messageQueries.length, 0)
})

test('creates a summary for messages outside the retained recent window', async () => {
  const { calls, db } = createFakeDb({ totalMessages: 6 })
  const { modelClient, requests } = createFakeModelClient([
    { choices: [{ delta: { content: 'Compact' } }] },
    { choices: [{ delta: { content: ' summary.' }, finishReason: 'stop' }] },
  ])
  const service = createSessionSummaryService({
    db,
    options: {
      minMessages: 5,
      retainRecentMessages: 2,
      minNewMessages: 2,
    },
  })

  const result = await service.maybeRefreshSessionSummary({
    userId: 'user_1',
    sessionId: 'session_1',
    modelClient,
    signal: new AbortController().signal,
  })

  assert.equal(result.created, true)
  assert.equal(result.created ? result.summary.content : '', 'Compact summary.')
  assert.equal(requests.length, 1)
  assert.deepEqual(requests[0]?.tools, [])
  assert.match(requests[0]?.messages[1]?.content ?? '', /Messages to summarize/)
  assert.deepEqual(calls.messageQueries[0], {
    where: {
      sessionId: 'session_1',
      session: {
        userId: 'user_1',
      },
      role: {
        in: [MessageRole.USER, MessageRole.ASSISTANT],
      },
    },
    orderBy: {
      createdAt: 'asc',
    },
    take: 4,
  })
  assert.deepEqual(calls.summaryCreates[0], {
    data: {
      session: {
        connect: {
          id: 'session_1',
          userId: 'user_1',
        },
      },
      content: 'Compact summary.',
      coveredMessageCount: 4,
      coveredThroughMessageId: 'msg_4',
    },
  })
})

test('uses the previous summary and skips when too few new messages are covered', async () => {
  const previousSummary = createSummary({ coveredMessageCount: 3 })
  const { db } = createFakeDb({ totalMessages: 6, latestSummary: previousSummary })
  const { modelClient, requests } = createFakeModelClient()
  const service = createSessionSummaryService({
    db,
    options: {
      minMessages: 5,
      retainRecentMessages: 2,
      minNewMessages: 2,
    },
  })

  const result = await service.maybeRefreshSessionSummary({
    userId: 'user_1',
    sessionId: 'session_1',
    modelClient,
    signal: new AbortController().signal,
  })

  assert.deepEqual(result, { created: false, reason: 'not_enough_new_messages' })
  assert.equal(requests.length, 0)
})

test('includes the previous summary when enough new messages are summarized', async () => {
  const previousSummary = createSummary({ coveredMessageCount: 2, content: 'Earlier summary.' })
  const { db } = createFakeDb({ totalMessages: 7, latestSummary: previousSummary })
  const { modelClient, requests } = createFakeModelClient()
  const service = createSessionSummaryService({
    db,
    options: {
      minMessages: 5,
      retainRecentMessages: 2,
      minNewMessages: 2,
    },
  })

  await service.maybeRefreshSessionSummary({
    userId: 'user_1',
    sessionId: 'session_1',
    modelClient,
    signal: new AbortController().signal,
  })

  assert.match(requests[0]?.messages[1]?.content ?? '', /Previous summary:\nEarlier summary/)
})
