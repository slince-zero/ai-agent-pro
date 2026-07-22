import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createAccountSendRateLimiter } from './account-send-rate-limit.js'

test('limits normalized account identifiers without retaining raw emails', () => {
  let now = 1_000
  const limiter = createAccountSendRateLimiter({
    max: 2,
    windowSeconds: 60,
    now: () => now,
  })

  assert.equal(limiter.consume('reset', ' Test@Example.com ').allowed, true)
  assert.equal(limiter.consume('reset', 'test@example.com').allowed, true)
  const limited = limiter.consume('reset', 'TEST@example.com')

  assert.equal(limited.allowed, false)
  assert.equal(limited.retryAfterSeconds, 60)
  assert.equal(limiter.consume('verify', 'test@example.com').allowed, true)
  assert.equal(limiter.consume('reset', 'other@example.com').allowed, true)

  now += 60_001
  assert.equal(limiter.consume('reset', 'test@example.com').allowed, true)
})

test('bounds account buckets and reclaims expired entries', () => {
  let now = 1_000
  const limiter = createAccountSendRateLimiter({
    maxBuckets: 2,
    windowSeconds: 60,
    now: () => now,
  })

  assert.equal(limiter.consume('reset', 'one@example.com').allowed, true)
  assert.equal(limiter.consume('reset', 'two@example.com').allowed, true)
  assert.equal(limiter.consume('reset', 'three@example.com').allowed, false)

  now += 60_001
  assert.equal(limiter.consume('reset', 'three@example.com').allowed, true)
})
