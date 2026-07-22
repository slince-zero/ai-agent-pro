import assert from 'node:assert/strict'
import type { Server } from 'node:http'
import { after, before, test } from 'node:test'

import cors from 'cors'
import express from 'express'

import { apiErrorHandler } from './api-error.js'
import {
  createBodyTypeGuard,
  createCorsOptions,
  createOriginGuard,
  createRequestBounds,
  createSecurityHeaders,
  parseTrustProxy,
  resolveAllowedOrigins,
} from './http-security.js'

const allowedOrigin = 'https://app.example.com'
let server: Server
let baseUrl: string

before(async () => {
  const app = express()
  const options = {
    allowedOrigins: [allowedOrigin],
    maxBodyBytes: 64,
    maxUrlChars: 128,
    production: true,
  }

  app.use(createSecurityHeaders(options))
  app.use('/api', createRequestBounds(options))
  app.use('/api', createOriginGuard(options))
  app.use('/api', cors(createCorsOptions(options.allowedOrigins)))
  app.use('/api', createBodyTypeGuard(['application/json']))
  app.use('/api', express.json({ limit: options.maxBodyBytes }))
  app.all('/api/echo', (req, res) => res.json({ ok: true, body: req.body }))
  app.post('/api/webhooks/payment', (_req, res) => res.json({ accepted: true }))
  app.use(apiErrorHandler)

  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => resolve())
  })

  const address = server.address()
  assert.ok(address && typeof address === 'object')
  baseUrl = `http://127.0.0.1:${address.port}`
})

after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
  })
})

test('accepts bounded trust proxy settings and rejects unsafe catch-all values', () => {
  assert.equal(parseTrustProxy(undefined), false)
  assert.equal(parseTrustProxy('1'), 1)
  assert.deepEqual(parseTrustProxy('loopback, 10.0.0.0/8'), ['loopback', '10.0.0.0/8'])

  for (const value of ['true', '*', '0', '0.0.0.0/0', '::/0', '11']) {
    assert.throws(() => parseTrustProxy(value), /TRUST_PROXY/)
  }
})

test('normalizes configured origins and rejects non-HTTP origins', () => {
  assert.deepEqual(
    resolveAllowedOrigins(['https://app.example.com/path', 'https://app.example.com']),
    [allowedOrigin],
  )
  assert.throws(() => resolveAllowedOrigins(['file:///tmp/app']), /HTTP\(S\)/)
})

test('sets production security headers and scoped CORS headers', async () => {
  const response = await fetch(`${baseUrl}/api/echo`, {
    headers: { origin: allowedOrigin },
  })

  assert.equal(response.status, 200)
  assert.equal(response.headers.get('access-control-allow-origin'), allowedOrigin)
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
  assert.equal(response.headers.get('x-frame-options'), 'DENY')
  assert.match(response.headers.get('content-security-policy') ?? '', /default-src 'self'/)
  assert.match(response.headers.get('strict-transport-security') ?? '', /max-age=31536000/)
})

test('rejects disallowed, cross-site, and origin-less cookie mutations', async () => {
  const cases: RequestInit[] = [
    { headers: { origin: 'https://evil.example.com' } },
    { headers: { origin: allowedOrigin, 'sec-fetch-site': 'cross-site' } },
    { headers: { cookie: 'session=secret' } },
  ]

  for (const init of cases) {
    const response = await fetch(`${baseUrl}/api/echo`, { ...init, method: 'POST' })
    const body = (await response.json()) as { code: string }
    assert.equal(response.status, 403)
    assert.equal(body.code, 'FORBIDDEN_ORIGIN')
  }
})

test('allows origin-less machine webhooks but still rejects browser-cookie requests', async () => {
  const machineResponse = await fetch(`${baseUrl}/api/webhooks/payment`, { method: 'POST' })
  assert.equal(machineResponse.status, 200)

  const browserResponse = await fetch(`${baseUrl}/api/webhooks/payment`, {
    method: 'POST',
    headers: { cookie: 'session=secret' },
  })
  assert.equal(browserResponse.status, 403)
})

test('rejects oversized bodies and URLs with stable error codes', async () => {
  const bodyResponse = await fetch(`${baseUrl}/api/echo`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ value: 'x'.repeat(100) }),
  })
  assert.equal(bodyResponse.status, 413)
  assert.equal(((await bodyResponse.json()) as { code: string }).code, 'PAYLOAD_TOO_LARGE')

  const urlResponse = await fetch(`${baseUrl}/api/echo?value=${'x'.repeat(150)}`)
  assert.equal(urlResponse.status, 414)
  assert.equal(((await urlResponse.json()) as { code: string }).code, 'URI_TOO_LONG')
})

test('rejects unsupported request body media types', async () => {
  const response = await fetch(`${baseUrl}/api/echo`, {
    method: 'POST',
    headers: { 'content-type': 'text/plain' },
    body: 'not-json',
  })

  assert.equal(response.status, 415)
  assert.equal(((await response.json()) as { code: string }).code, 'UNSUPPORTED_MEDIA_TYPE')
})
