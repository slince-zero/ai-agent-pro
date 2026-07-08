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
  const calls: {
    messageFindFirsts: unknown[]
    messageQueries: unknown[]
    messageUpdates: unknown[]
    sessionUpdates: unknown[]
  } = {
    messageFindFirsts: [],
    sessionUpdates: [],
    messageQueries: [],
    messageUpdates: [],
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
          status:
            (args as { data?: { status?: typeof SessionStatus.ACTIVE } }).data?.status ??
            activeSession.status,
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
      findFirst: async (args: unknown) => {
        calls.messageFindFirsts.push(args)
        const role = (args as { where?: { role?: typeof MessageRole.USER } }).where?.role
        if (role === MessageRole.USER) return userMessage
        if (role === MessageRole.ASSISTANT) return assistantMessage
        return null
      },
      findMany: async (args: unknown) => {
        calls.messageQueries.push(args)
        return (args as { include?: unknown }).include
          ? [userMessage, assistantMessage]
          : [assistantMessage, userMessage, { ...userMessage, role: MessageRole.SYSTEM }]
      },
      update: async (args: unknown) => {
        calls.messageUpdates.push(args)
        return {
          ...assistantMessage,
          content:
            (args as { data?: { content?: string } }).data?.content ?? assistantMessage.content,
        }
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

test('renames and archives active sessions for the owning user', async () => {
  const { calls, db } = createFakeDb()
  const service = createSessionService({ db })

  const renamed = await service.renameActiveSession('user_1', 'session_1', '  New   title  ')
  const archived = await service.archiveActiveSession('user_1', 'session_1')

  assert.equal(renamed?.title, 'New title')
  assert.equal(archived?.status, 'archived')
  assert.deepEqual(calls.sessionUpdates, [
    {
      where: {
        id: 'session_1',
      },
      data: {
        title: 'New title',
      },
    },
    {
      where: {
        id: 'session_1',
      },
      data: {
        status: SessionStatus.ARCHIVED,
      },
    },
  ])
})

test('loads recent context while excluding regenerated assistant messages', async () => {
  const { calls, db } = createFakeDb()
  const service = createSessionService({ db })

  await service.getRecentClientMessages('session_1', 3, {
    excludeMessageIds: ['msg_assistant'],
  })

  assert.deepEqual(calls.messageQueries[0], {
    where: {
      sessionId: 'session_1',
      id: {
        notIn: ['msg_assistant'],
      },
      role: {
        in: [MessageRole.USER, MessageRole.ASSISTANT],
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: 3,
  })
})

test('finds regeneration target and updates assistant message content', async () => {
  const { calls, db } = createFakeDb()
  const service = createSessionService({ db })

  const target = await service.getLatestRegenerationTarget('session_1')
  const updated = await service.updateAssistantMessage('msg_assistant', 'Updated answer')

  assert.equal(target?.userMessage.id, 'msg_user')
  assert.equal(target?.assistantMessage.id, 'msg_assistant')
  assert.equal(updated.content, 'Updated answer')
  assert.deepEqual(calls.messageFindFirsts, [
    {
      where: {
        sessionId: 'session_1',
        role: MessageRole.USER,
      },
      orderBy: {
        createdAt: 'desc',
      },
    },
    {
      where: {
        sessionId: 'session_1',
        role: MessageRole.ASSISTANT,
        createdAt: {
          gt: userMessage.createdAt,
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    },
  ])
  assert.deepEqual(calls.messageUpdates[0], {
    where: {
      id: 'msg_assistant',
    },
    data: {
      content: 'Updated answer',
    },
  })
})
