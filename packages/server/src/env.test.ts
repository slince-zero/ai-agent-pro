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
  assert.equal(result.AUTH_EMAIL_PROVIDER, 'console')
})

test('requires explicit Better Auth settings in production', () => {
  assert.throws(
    () =>
      parseEnv({
        ...requiredEnv,
        NODE_ENV: 'production',
      }),
    /BETTER_AUTH_SECRET[\s\S]*BETTER_AUTH_URL[\s\S]*TRUST_PROXY[\s\S]*AUTH_EMAIL_PROVIDER[\s\S]*AUTH_EMAIL_FROM[\s\S]*RESEND_API_KEY/,
  )
})

test('accepts valid production auth settings', () => {
  const result = parseEnv({
    ...requiredEnv,
    NODE_ENV: 'production',
    BETTER_AUTH_SECRET: 'production-secret-with-at-least-32-characters',
    BETTER_AUTH_URL: 'https://agent.example.com',
    AUTH_APP_URL: 'https://app.example.com',
    AUTH_EMAIL_PROVIDER: 'resend',
    AUTH_EMAIL_FROM: 'Agent <auth@example.com>',
    RESEND_API_KEY: 're_production_key',
    TRUST_PROXY: '1',
  })

  assert.equal(result.BETTER_AUTH_URL, 'https://agent.example.com')
  assert.equal(result.AUTH_APP_URL, 'https://app.example.com')
  assert.equal(result.TRUST_PROXY, '1')
})

test('rejects unsafe proxy trust and the development auth secret', () => {
  assert.throws(
    () =>
      parseEnv({
        ...requiredEnv,
        NODE_ENV: 'production',
        BETTER_AUTH_SECRET: 'ai-agent-pro-development-only-auth-secret',
        BETTER_AUTH_URL: 'https://agent.example.com',
        AUTH_EMAIL_PROVIDER: 'resend',
        AUTH_EMAIL_FROM: 'Agent <auth@example.com>',
        RESEND_API_KEY: 're_production_key',
        TRUST_PROXY: 'true',
      }),
    /TRUST_PROXY[\s\S]*BETTER_AUTH_SECRET/,
  )
})
