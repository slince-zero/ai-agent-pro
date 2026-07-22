import assert from 'node:assert/strict'
import { test } from 'node:test'

import { memoryAdapter } from 'better-auth/adapters/memory'

import { createMemoryEmailVerificationTokenStore } from './services/email-verification-token.js'

process.env.OPENAI_API_KEY = 'test-api-key'
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test'
process.env.NODE_ENV = 'test'

const { createAuth } = await import('./auth.js')

test('email delivery failure never creates a verified user state', async () => {
  const database = {
    user: [] as Record<string, unknown>[],
    authSession: [] as Record<string, unknown>[],
    account: [] as Record<string, unknown>[],
    verification: [] as Record<string, unknown>[],
  }
  const failingAuth = createAuth({
    database: memoryAdapter(database),
    baseURL: 'http://auth.example.com',
    appURL: 'http://app.example.com',
    secret: 'test-secret-with-at-least-32-characters',
    emailSender: {
      async send() {
        throw new Error('email provider unavailable')
      },
    },
    emailVerificationTokens: createMemoryEmailVerificationTokenStore(),
    rateLimitEnabled: false,
  })
  const response = await failingAuth.handler(
    new Request('http://auth.example.com/api/auth/sign-up/email', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://auth.example.com',
      },
      body: JSON.stringify({
        name: 'Failed Delivery',
        email: 'failed@example.com',
        password: 'password123',
      }),
    }),
  )

  assert.equal(response.status, 200)
  assert.equal(response.headers.get('set-cookie'), null)
  assert.equal(
    database.user.every((user) => user.emailVerified === false),
    true,
  )
})
