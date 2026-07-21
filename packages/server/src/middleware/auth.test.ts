import assert from 'node:assert/strict'
import type { Server } from 'node:http'
import { after, before, test } from 'node:test'

import express from 'express'

import type { AuthenticatedSession } from './auth.js'

process.env.OPENAI_API_KEY = 'test-api-key'
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test'
process.env.NODE_ENV = 'test'

function testSession(userId: string): AuthenticatedSession {
  const now = new Date('2026-07-21T08:00:00.000Z')

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

let server: Server
let baseUrl: string

before(async () => {
  const { createRequireAuth } = await import('./auth.js')
  const app = express()

  app.use(
    '/api',
    createRequireAuth({
      getSession: async (headers) => {
        const userId = headers.get('x-test-user')
        if (userId === 'error') throw new Error('session store unavailable')
        return userId ? testSession(userId) : null
      },
    }),
  )
  app.get('/api/protected', (req, res) => {
    res.json({ userId: req.auth.user.id })
  })
  app.use(
    (_error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      res.status(503).json({ error: 'session lookup failed' })
    },
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

test('returns 401 when an API request has no authenticated session', async () => {
  const response = await fetch(`${baseUrl}/api/protected`)

  assert.equal(response.status, 401)
  assert.deepEqual(await response.json(), { error: 'Unauthorized' })
})

test('attaches the authenticated user to the Express request', async () => {
  const response = await fetch(`${baseUrl}/api/protected`, {
    headers: { 'x-test-user': 'user_1' },
  })

  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { userId: 'user_1' })
})

test('forwards session store failures to the application error handler', async () => {
  const response = await fetch(`${baseUrl}/api/protected`, {
    headers: { 'x-test-user': 'error' },
  })

  assert.equal(response.status, 503)
  assert.deepEqual(await response.json(), { error: 'session lookup failed' })
})
