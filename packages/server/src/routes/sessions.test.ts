import assert from 'node:assert/strict'
import type { Server } from 'node:http'
import { after, before, test } from 'node:test'

import express from 'express'

import { SessionStatus } from '../generated/prisma/client.js'
import type { AuthenticatedSession } from '../middleware/auth.js'
import type { ModelClient } from '../runtime/model-client/types.js'
import type { createChatService } from '../services/chat-service.js'
import type { createSessionService } from '../services/session-service.js'

process.env.OPENAI_API_KEY = 'test-api-key'
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test'
process.env.NODE_ENV = 'test'

const now = new Date('2026-07-21T08:00:00.000Z')
const sessions = [
  {
    id: 'session_1',
    userId: 'user_1',
    title: 'User one session',
    status: SessionStatus.ACTIVE,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'session_2',
    userId: 'user_2',
    title: 'User two session',
    status: SessionStatus.ACTIVE,
    createdAt: now,
    updatedAt: now,
  },
]

function testSession(userId: string): AuthenticatedSession {
  return {
    session: {
      id: `auth_session_${userId}`,
      token: `token_${userId}`,
      userId,
      expiresAt: new Date('2026-07-22T08:00:00.000Z'),
      createdAt: now,
      updatedAt: now,
      ipAddress: null,
      userAgent: null,
    },
    user: {
      id: userId,
      name: userId,
      email: `${userId}@example.com`,
      emailVerified: true,
      image: null,
      createdAt: now,
      updatedAt: now,
    },
  }
}

function ownedSession(userId: string, sessionId: string) {
  return sessions.find(
    (session) =>
      session.id === sessionId &&
      session.userId === userId &&
      session.status === SessionStatus.ACTIVE,
  )
}

const chatCalls = {
  send: 0,
  regenerate: 0,
}

function createFakeSessionService() {
  return {
    listActiveSessions: async (userId: string) =>
      sessions.filter((session) => session.userId === userId).map((session) => ({ ...session })),
    createSession: async (userId: string, title?: string) => ({
      ...sessions[0],
      id: 'session_created',
      userId,
      title: title ?? '新对话',
    }),
    renameActiveSession: async (userId: string, sessionId: string, title: string) => {
      const session = ownedSession(userId, sessionId)
      return session ? { ...session, title } : null
    },
    archiveActiveSession: async (userId: string, sessionId: string) => {
      const session = ownedSession(userId, sessionId)
      return session ? { ...session, status: 'archived' } : null
    },
    getActiveSession: async (userId: string, sessionId: string) =>
      ownedSession(userId, sessionId) ?? null,
    listSessionMessages: async (userId: string, sessionId: string) =>
      ownedSession(userId, sessionId)
        ? [{ id: 'message_1', role: 'user', content: 'Hello', createdAt: now.toISOString() }]
        : null,
    getLatestRegenerationTarget: async (userId: string, sessionId: string) =>
      ownedSession(userId, sessionId)
        ? {
            userMessage: { id: 'user_message', role: 'USER', content: 'Hello', createdAt: now },
            assistantMessage: {
              id: 'assistant_message',
              role: 'ASSISTANT',
              content: 'Hi',
              createdAt: now,
            },
          }
        : null,
  } as unknown as ReturnType<typeof createSessionService>
}

function createFakeChatService() {
  return {
    sendMessage: async () => {
      chatCalls.send += 1
      return { inputTokens: 0, outputTokens: 0, cost: 0 }
    },
    regenerateLastAssistant: async () => {
      chatCalls.regenerate += 1
      return { inputTokens: 0, outputTokens: 0, cost: 0 }
    },
  } as unknown as ReturnType<typeof createChatService>
}

let server: Server
let baseUrl: string

before(async () => {
  const { createRequireAuth } = await import('../middleware/auth.js')
  const { createSessionsRouter } = await import('./sessions.js')
  const app = express()

  app.use(
    '/api',
    createRequireAuth({
      getSession: async (headers) => {
        const userId = headers.get('x-test-user')
        return userId ? testSession(userId) : null
      },
    }),
  )
  app.use(express.json())
  app.use(
    '/api/sessions',
    createSessionsRouter({
      modelClient: {} as ModelClient,
      sessionService: createFakeSessionService(),
      chatService: createFakeChatService(),
    }),
  )

  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => resolve())
  })

  const address = server.address()
  assert.ok(address && typeof address === 'object')
  baseUrl = `http://127.0.0.1:${address.port}`
})

after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
  })
})

function sessionRequest(path = '', userId?: string, init: RequestInit = {}) {
  return fetch(`${baseUrl}/api/sessions${path}`, {
    ...init,
    headers: {
      ...(userId ? { 'x-test-user': userId } : {}),
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...init.headers,
    },
  })
}

test('requires authentication and lists only the current user sessions', async () => {
  const unauthenticated = await sessionRequest()
  assert.equal(unauthenticated.status, 401)

  const response = await sessionRequest('', 'user_1')
  const body = (await response.json()) as { sessions: { id: string; userId: string }[] }

  assert.equal(response.status, 200)
  assert.deepEqual(
    body.sessions.map((session) => session.id),
    ['session_1'],
  )
  assert.equal(body.sessions[0]?.userId, 'user_1')
})

test('hides cross-user sessions from read, modify, delete and chat operations', async () => {
  const requests = [
    sessionRequest('/session_2/messages', 'user_1'),
    sessionRequest('/session_2', 'user_1', {
      method: 'PATCH',
      body: JSON.stringify({ title: 'Unauthorized rename' }),
    }),
    sessionRequest('/session_2', 'user_1', { method: 'DELETE' }),
    sessionRequest('/session_2/messages', 'user_1', {
      method: 'POST',
      body: JSON.stringify({ content: 'Unauthorized chat' }),
    }),
    sessionRequest('/session_2/regenerate', 'user_1', {
      method: 'POST',
      body: JSON.stringify({}),
    }),
  ]

  const responses = await Promise.all(requests)
  for (const response of responses) {
    assert.equal(response.status, 404)
    assert.deepEqual(await response.json(), { error: '会话不存在', code: 'SESSION_NOT_FOUND' })
  }

  assert.deepEqual(chatCalls, { send: 0, regenerate: 0 })

  const missing = await sessionRequest('/missing/messages', 'user_1')
  assert.equal(missing.status, 404)
  assert.deepEqual(await missing.json(), { error: '会话不存在', code: 'SESSION_NOT_FOUND' })
})

test('allows the owner to read session messages', async () => {
  const response = await sessionRequest('/session_1/messages', 'user_1')
  const body = (await response.json()) as { messages: { id: string }[] }

  assert.equal(response.status, 200)
  assert.deepEqual(
    body.messages.map((message) => message.id),
    ['message_1'],
  )
})

test('returns a stable 422 error for invalid request bodies', async () => {
  const response = await sessionRequest('/session_1/messages', 'user_1', {
    method: 'POST',
    body: JSON.stringify({ content: '' }),
  })

  assert.equal(response.status, 422)
  assert.deepEqual(await response.json(), { error: '消息内容无效', code: 'VALIDATION_ERROR' })
})
