import assert from 'node:assert/strict'
import { afterEach, mock, test } from 'node:test'

import { webFetchTool } from './web-fetch.js'

type WebFetchResult = {
  error?: string
  final_url?: string
  status?: number
  text?: string
  title?: string
}

function parseResult(result: string) {
  return JSON.parse(result) as WebFetchResult
}

function createContext() {
  return { signal: new AbortController().signal }
}

afterEach(() => {
  mock.restoreAll()
})

test('rejects direct private addresses before fetch', async () => {
  const fetchMock = mock.method(globalThis, 'fetch', async () => {
    throw new Error('fetch should not be called')
  })

  const result = parseResult(
    await webFetchTool.run({ url: 'http://127.0.0.1/admin' }, createContext()),
  )

  assert.match(result.error ?? '', /内网|本机|保留地址/)
  assert.equal(fetchMock.mock.callCount(), 0)
})

test('rejects localhost before fetch', async () => {
  const fetchMock = mock.method(globalThis, 'fetch', async () => {
    throw new Error('fetch should not be called')
  })

  const result = parseResult(
    await webFetchTool.run({ url: 'http://localhost:3000/health' }, createContext()),
  )

  assert.match(result.error ?? '', /localhost/)
  assert.equal(fetchMock.mock.callCount(), 0)
})

test('rejects ipv4-mapped ipv6 loopback addresses before fetch', async () => {
  const fetchMock = mock.method(globalThis, 'fetch', async () => {
    throw new Error('fetch should not be called')
  })

  const result = parseResult(
    await webFetchTool.run({ url: 'http://[::ffff:127.0.0.1]/admin' }, createContext()),
  )

  assert.match(result.error ?? '', /内网|本机|保留地址/)
  assert.equal(fetchMock.mock.callCount(), 0)
})

test('rejects redirects to private addresses', async () => {
  const fetchMock = mock.method(
    globalThis,
    'fetch',
    async () =>
      new Response(null, {
        status: 302,
        headers: {
          location: 'http://169.254.169.254/latest/meta-data',
        },
      }),
  )

  const result = parseResult(
    await webFetchTool.run({ url: 'http://93.184.216.34/start' }, createContext()),
  )

  assert.match(result.error ?? '', /内网|本机|保留地址/)
  assert.equal(fetchMock.mock.callCount(), 1)
})

test('fetches and sanitizes public text responses', async () => {
  mock.method(
    globalThis,
    'fetch',
    async () =>
      new Response(
        '<html><head><title>Hello &amp; Test</title><script>ignore()</script></head><body>Hello&nbsp;<strong>world</strong></body></html>',
        {
          status: 200,
          headers: {
            'content-type': 'text/html; charset=utf-8',
          },
        },
      ),
  )

  const result = parseResult(
    await webFetchTool.run({ url: 'http://93.184.216.34/page' }, createContext()),
  )

  assert.equal(result.status, 200)
  assert.equal(result.final_url, 'http://93.184.216.34/page')
  assert.equal(result.title, 'Hello & Test')
  assert.match(result.text ?? '', /Hello world/)
  assert.doesNotMatch(result.text ?? '', /ignore/)
})
