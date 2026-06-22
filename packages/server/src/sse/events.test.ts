import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { Response } from 'express'

import { createSseWriter, prepareSse, writeSseHeartbeat } from './events.js'

function createFakeResponse() {
  const headers = new Map<string, string>()
  const writes: string[] = []

  return {
    headers,
    writes,
    res: {
      writableEnded: false,
      setHeader(name: string, value: string) {
        headers.set(name, value)
      },
      flushHeaders() {
        headers.set('flushed', 'true')
      },
      write(chunk: string) {
        writes.push(chunk)
      },
    } as unknown as Response,
  }
}

test('prepares SSE response headers for streaming', () => {
  const { headers, res } = createFakeResponse()

  prepareSse(res)

  assert.equal(headers.get('Content-Type'), 'text/event-stream')
  assert.equal(headers.get('Cache-Control'), 'no-cache')
  assert.equal(headers.get('Connection'), 'keep-alive')
  assert.equal(headers.get('X-Accel-Buffering'), 'no')
  assert.equal(headers.get('flushed'), 'true')
})

test('writes named SSE events with stable ids and eventId payloads', () => {
  const { res, writes } = createFakeResponse()
  const writer = createSseWriter(res)

  writer.write({ type: 'run_id', runId: 'run_123' })
  writer.write({ type: 'text', text: 'Hello' })

  assert.deepEqual(writes, [
    'id: run_123:1\nevent: run_id\ndata: {"type":"run_id","runId":"run_123","eventId":"run_123:1"}\n\n',
    'id: run_123:2\nevent: text\ndata: {"type":"text","text":"Hello","eventId":"run_123:2"}\n\n',
  ])
})

test('writes SSE heartbeat comment frames', () => {
  const { res, writes } = createFakeResponse()

  writeSseHeartbeat(res)

  assert.equal(writes.length, 1)
  assert.match(writes[0] ?? '', /^: heartbeat .+\n\n$/)
})
