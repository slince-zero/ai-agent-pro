import assert from 'node:assert/strict'
import { test } from 'node:test'

process.env.OPENAI_API_KEY = 'test-api-key'
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test'

const { parseEnv } = await import('./env.js')

const requiredEnv = {
  OPENAI_API_KEY: 'test-api-key',
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
}

test('allows development without production auth settings', () => {
  const result = parseEnv({
    ...requiredEnv,
    NODE_ENV: 'development',
  })

  assert.equal(result.BETTER_AUTH_SECRET, undefined)
  assert.equal(result.BETTER_AUTH_URL, undefined)
})

test('requires explicit Better Auth settings in production', () => {
  assert.throws(
    () =>
      parseEnv({
        ...requiredEnv,
        NODE_ENV: 'production',
      }),
    /BETTER_AUTH_SECRET[\s\S]*BETTER_AUTH_URL/,
  )
})

test('accepts valid production auth settings', () => {
  const result = parseEnv({
    ...requiredEnv,
    NODE_ENV: 'production',
    BETTER_AUTH_SECRET: 'production-secret-with-at-least-32-characters',
    BETTER_AUTH_URL: 'https://agent.example.com',
  })

  assert.equal(result.BETTER_AUTH_URL, 'https://agent.example.com')
})
