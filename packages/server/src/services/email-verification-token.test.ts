import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createMemoryEmailVerificationTokenStore } from './email-verification-token.js'

test('consumes verification tokens once and rejects forged values', async () => {
  const store = createMemoryEmailVerificationTokenStore()
  await store.issue('valid-token', 'user-1', 60)

  assert.equal(await store.consume('forged-token'), false)
  assert.equal(await store.consume('valid-token'), true)
  assert.equal(await store.consume('valid-token'), false)
})

test('rejects expired verification tokens', async () => {
  let now = 1_000
  const store = createMemoryEmailVerificationTokenStore(() => now)
  await store.issue('expiring-token', 'user-1', 30)

  now += 30_001

  assert.equal(await store.consume('expiring-token'), false)
})

test('issuing a new token invalidates the previous token for that user only', async () => {
  const store = createMemoryEmailVerificationTokenStore()
  await store.issue('user-one-old', 'user-1', 60)
  await store.issue('user-two', 'user-2', 60)
  await store.issue('user-one-new', 'user-1', 60)

  assert.equal(await store.consume('user-one-old'), false)
  assert.equal(await store.consume('user-two'), true)
  assert.equal(await store.consume('user-one-new'), true)
})
