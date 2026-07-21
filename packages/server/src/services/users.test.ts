import assert from 'node:assert/strict'
import { test } from 'node:test'

process.env.OPENAI_API_KEY = 'test-api-key'
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test'
process.env.NODE_ENV = 'production'
process.env.BETTER_AUTH_SECRET = 'production-secret-with-at-least-32-characters'
process.env.BETTER_AUTH_URL = 'https://agent.example.com'

const { getCurrentUser } = await import('./users.js')

test('rejects the default user bypass in production', async () => {
  await assert.rejects(getCurrentUser(), /DEFAULT_USER_EMAIL is only available outside production/)
})
