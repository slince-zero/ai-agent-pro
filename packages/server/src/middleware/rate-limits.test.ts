import assert from 'node:assert/strict'
import type { Server } from 'node:http'
import { after, before, test } from 'node:test'

import express from 'express'

import type { AuthenticatedSession } from './auth.js'
import { createAuthenticatedRateLimiter, createRunConcurrencyLimit } from './rate-limits.js'

function authSession(userId: string) {
  return { user: { id: userId } } as AuthenticatedSession
}

let server: Server
let baseUrl: string
const pendingRuns: Array<() => void> = []

before(async () => {
  const app = express()
  const attachUser: express.RequestHandler = (req, _res, next) => {
    req.auth = authSession(req.get('x-test-user') ?? 'user_1')
    next()
  }

  app.use(attachUser)
  app.get('/rate', createAuthenticatedRateLimiter({ windowMs: 60_000, max: 2 }), (_req, res) =>
    res.json({ ok: true }),
  )
  app.get('/run', createRunConcurrencyLimit(2), (_req, res) => {
    pendingRuns.push(() => res.json({ done: true }))
  })

  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => resolve())
  })

  const address = server.address()
  assert.ok(address && typeof address === 'object')
  baseUrl = `http://127.0.0.1:${address.port}`
})

after(async () => {
  for (const release of pendingRuns.splice(0)) release()
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
  })
})

async function waitForPendingRuns(count: number) {
  const deadline = Date.now() + 1_000
  while (pendingRuns.length < count && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  assert.equal(pendingRuns.length, count)
}

test('returns 429 with retry metadata after a per-user rate limit is exhausted', async () => {
  const headers = { 'x-test-user': 'rate-user' }
  assert.equal((await fetch(`${baseUrl}/rate`, { headers })).status, 200)
  assert.equal((await fetch(`${baseUrl}/rate`, { headers })).status, 200)

  const limited = await fetch(`${baseUrl}/rate`, { headers })
  const body = (await limited.json()) as { code: string }
  assert.equal(limited.status, 429)
  assert.equal(body.code, 'RATE_LIMITED')
  assert.ok(limited.headers.get('retry-after'))

  assert.equal(
    (await fetch(`${baseUrl}/rate`, { headers: { 'x-test-user': 'other-user' } })).status,
    200,
  )
})

test('limits concurrent runs per user and releases slots when streams finish', async () => {
  const headers = { 'x-test-user': 'run-user' }
  const first = fetch(`${baseUrl}/run`, { headers })
  const second = fetch(`${baseUrl}/run`, { headers })
  await waitForPendingRuns(2)

  const limited = await fetch(`${baseUrl}/run`, { headers })
  assert.equal(limited.status, 429)
  assert.equal(((await limited.json()) as { code: string }).code, 'RUN_CONCURRENCY_LIMITED')
  assert.equal(limited.headers.get('retry-after'), '1')

  pendingRuns.shift()?.()
  await first

  const third = fetch(`${baseUrl}/run`, { headers })
  await waitForPendingRuns(2)
  pendingRuns.shift()?.()
  pendingRuns.shift()?.()
  await Promise.all([second, third])
})
