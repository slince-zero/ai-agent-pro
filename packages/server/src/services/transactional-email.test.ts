import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createResendEmailSender, type TransactionalEmail } from './transactional-email.js'

const message: TransactionalEmail = {
  to: 'user@example.com',
  subject: 'Verify email',
  text: 'Open the link',
  html: '<p>Open the link</p>',
  idempotencyKey: 'auth-verify-123',
}

test('sends transactional email through the Resend HTTP boundary', async () => {
  let requestUrl = ''
  let requestInit: RequestInit | undefined
  const sender = createResendEmailSender({
    apiKey: 're_test_key',
    from: 'Agent <auth@example.com>',
    fetch: async (input, init) => {
      requestUrl = String(input)
      requestInit = init
      return Response.json({ id: 'email-1' })
    },
  })

  await sender.send(message)

  assert.equal(requestUrl, 'https://api.resend.com/emails')
  assert.ok(requestInit)
  assert.equal(requestInit.method, 'POST')
  assert.equal(
    (requestInit.headers as Record<string, string>)['Authorization'],
    'Bearer re_test_key',
  )
  assert.equal(
    (requestInit.headers as Record<string, string>)['Idempotency-Key'],
    message.idempotencyKey,
  )
  assert.deepEqual(JSON.parse(String(requestInit.body)), {
    from: 'Agent <auth@example.com>',
    to: ['user@example.com'],
    subject: message.subject,
    text: message.text,
    html: message.html,
  })
})

test('does not expose provider response bodies in delivery errors', async () => {
  const sender = createResendEmailSender({
    apiKey: 're_test_key',
    from: 'auth@example.com',
    fetch: async () => Response.json({ message: 'secret provider detail' }, { status: 422 }),
  })

  await assert.rejects(
    () => sender.send(message),
    (error: unknown) => {
      assert.ok(error instanceof Error)
      assert.match(error.message, /422/)
      assert.doesNotMatch(error.message, /secret provider detail/)
      return true
    },
  )
})
