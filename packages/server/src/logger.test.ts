import assert from 'node:assert/strict'
import { Writable } from 'node:stream'
import { test } from 'node:test'

process.env.OPENAI_API_KEY = 'test-api-key'
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test'
process.env.NODE_ENV = 'test'

const { createLogger } = await import('./logger.js')

test('structured logs redact secrets from fields, errors, and URLs', async () => {
  let output = ''
  const destination = new Writable({
    write(chunk, _encoding, callback) {
      output += chunk.toString()
      callback()
    },
  })
  const testLogger = createLogger({ production: true, destination })

  testLogger.info(
    {
      authorization: 'Bearer top-secret-token',
      nested: { token: 'nested-secret' },
      err: new Error('provider failed with Bearer error-secret'),
      url: '/verify?token=query-secret&run_id=run_1',
    },
    'request failed',
  )

  await new Promise((resolve) => setImmediate(resolve))
  assert.doesNotMatch(output, /top-secret|nested-secret|error-secret|query-secret/)
  assert.match(output, /\[Redacted\]/)
  assert.match(output, /run_1/)
})
