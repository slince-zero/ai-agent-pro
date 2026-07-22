import assert from 'node:assert/strict'
import { test } from 'node:test'

import { redactSensitive, redactString, redactUrl } from './redaction.js'

test('redacts sensitive URL parameters without removing safe diagnostics', () => {
  const redacted = new URL(`https://example.com/callback${redactUrl('?token=secret&run_id=run_1')}`)

  assert.equal(redacted.searchParams.get('token'), '[Redacted]')
  assert.equal(redacted.searchParams.get('run_id'), 'run_1')
  assert.doesNotMatch(redacted.toString(), /secret/)
})

test('redacts bearer tokens and provider keys embedded in messages', () => {
  const value = redactString(
    'Authorization: Bearer header.payload.signature; provider=re_production_secret123; openai=sk-projectsecret123',
  )

  assert.doesNotMatch(value, /header\.payload|re_production|sk-project/)
  assert.match(value, /\[Redacted\]/)
})

test('recursively redacts cookies, API keys, passwords, signatures, and URLs', () => {
  const redacted = redactSensitive({
    authorization: 'Bearer secret-token',
    nested: {
      password: 'password123',
      webhook_signature: 'signature123',
      url: '/verify?token=email-secret&next=%2Fruns',
    },
    safe: 'run_1',
  }) as Record<string, unknown>

  assert.equal(redacted.authorization, '[Redacted]')
  assert.equal(redacted.safe, 'run_1')
  assert.doesNotMatch(
    JSON.stringify(redacted),
    /secret-token|password123|signature123|email-secret/,
  )
})
