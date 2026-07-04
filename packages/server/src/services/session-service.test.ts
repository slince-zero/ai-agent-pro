import assert from 'node:assert/strict'
import { test } from 'node:test'

process.env.OPENAI_API_KEY = 'test-api-key'
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test'

const { MessageRole, SessionStatus } = await import('../generated/prisma/client.js')
const { createSessionService } = await import('./session-service.js')

const createdAt = new Date('2026-06-17T07:00:00.000Z')
const updatedAt = new Date('2026-06-17T07:01:00.000Z')

const activeSession = {
  id: 'session_1',
  userId: 'user_1',
  title: 'Trace session',
  status: SessionStatus.ACTIVE,
  createdAt,
  updatedAt,
}

const userMessage = {
  id: 'msg_user',
  role: MessageRole.USER,
  content: 'Explain this run',
  createdAt,
}

const assistantMessage = {
  id: 'msg_assistant',
  role: MessageRole.ASSISTANT,
  content: 'Here is the explanation.',
  createdAt: updatedAt,
  citations: [
    {
      id: 'citation_1',
      messageId: 'msg_assistant',
      documentId: 'doc_1',
      documentChunkId: 'chunk_1',
      title: 'README.md',
      uri: 'https://github.com/slince-zero/ai-agent-pro/blob/main/README.md',
      sourceRef: 'README.md#L1-L3',
      snippet: 'Use pnpm test before opening PRs.',
      metadata: { score: 0.8 },
      createdAt: updatedAt,
    },
  ],
  assistantRuns: [
    {
      inputTokens: 42,
      outputTokens: 21,
      cost: 0.00042,
    },
  ],
}

function createFakeDb() {
  const calls: { sessionUpdates: unknown[]; messageQueries: unknown[] } = {
    sessionUpdates: [],
    messageQueries: [],
  }

  const db = {
    session: {
      findMany: async () => [activeSession],
      create: async (args: unknown) => ({
        ...activeSession,
        id: 'session_created',
        title: (args as { data?: { title?: string } }).data?.title ?? activeSession.title,
      }),
      findFirst: async (args: unknown) => {
        const where = (args as { where?: { id?: string; userId?: string } }).where
        return where?.id === activeSession.id && where.userId === activeSession.userId
          ? activeSession
          : null
      },
      update: async (args: unknown) => {
        calls.sessionUpdates.push(args)
        return {
          ...activeSession,
          title: (args as { data?: { title?: string } }).data?.title ?? activeSession.title,
        }
      },
    },
    message: {
      create: async (args: unknown) => ({
        id: 'msg_created',
        role: (args as { data: { role: typeof MessageRole.USER } }).data.role,
        content: (args as { data: { content: string } }).data.content,
        createdAt,
      }),
      findMany: async (args: unknown) => {
        calls.messageQueries.push(args)
        return (args as { include?: unknown }).include
          ? [userMessage, assistantMessage]
          : [assistantMessage, userMessage, { ...userMessage, role: MessageRole.SYSTEM }]
      },
    },
  }

  return { calls, db }
}

test('serializes active sessions and messages with completed usage', async () => {
  const { db } = createFakeDb()
  const service = createSessionService({ db })

  const sessions = await service.listActiveSessions('user_1')
  assert.deepEqual(sessions, [
    {
      id: 'session_1',
      title: 'Trace session',
      status: 'active',
      createdAt: createdAt.toISOString(),
      updatedAt: updatedAt.toISOString(),
    },
  ])

  const messages = await service.listSessionMessages('user_1', 'session_1')
  assert.deepEqual(messages, [
    {
      id: 'msg_user',
      role: 'user',
      content: 'Explain this run',
      createdAt: createdAt.toISOString(),
    },
    {
      id: 'msg_assistant',
      role: 'assistant',
      content: 'Here is the explanation.',
      createdAt: updatedAt.toISOString(),
      usage: {
        inputTokens: 42,
        outputTokens: 21,
        cost: 0.00042,
      },
      citations: [
        {
          id: 'citation_1',
          messageId: 'msg_assistant',
          documentId: 'doc_1',
          chunkId: 'chunk_1',
          title: 'README.md',
          uri: 'https://github.com/slince-zero/ai-agent-pro/blob/main/README.md',
          sourceRef: 'README.md#L1-L3',
          snippet: 'Use pnpm test before opening PRs.',
          metadata: { score: 0.8 },
          createdAt: updatedAt.toISOString(),
        },
      ],
    },
  ])
})

test('builds recent client messages and updates new session titles', async () => {
  const { calls, db } = createFakeDb()
  const service = createSessionService({ db })

  const messages = await service.getRecentClientMessages('session_1', 2)
  assert.deepEqual(messages, [
    { role: 'user', content: 'Explain this run' },
    { role: 'assistant', content: 'Here is the explanation.' },
  ])
  assert.deepEqual(calls.messageQueries[0], {
    where: {
      sessionId: 'session_1',
      role: {
        in: [MessageRole.USER, MessageRole.ASSISTANT],
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: 2,
  })

  await service.updateTitleFromMessageIfNeeded(
    { ...activeSession, title: '新对话' },
    '  Please   summarize this agent run in detail.  ',
  )

  assert.deepEqual(calls.sessionUpdates[0], {
    where: {
      id: 'session_1',
    },
    data: {
      title: 'Please summarize this agent run in detai...',
    },
  })
})
