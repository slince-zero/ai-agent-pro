import assert from 'node:assert/strict'
import { afterEach, mock, test } from 'node:test'

import {
  apiFetch,
  parseJsonResponse,
  resetUnauthorizedNotification,
  setUnauthorizedHandler,
} from './api.ts'

afterEach(() => {
  mock.restoreAll()
  resetUnauthorizedNotification()
})

test('includes cookies on business API requests', async () => {
  const fetchMock = mock.method(globalThis, 'fetch', async () => Response.json({ ok: true }))

  await apiFetch('/api/sessions')

  assert.equal(fetchMock.mock.calls[0]?.arguments[1]?.credentials, 'include')
})

test('signals the first 401 once and never retries the request', async () => {
  let unauthorizedCount = 0
  const removeHandler = setUnauthorizedHandler(() => {
    unauthorizedCount += 1
  })
  const fetchMock = mock.method(globalThis, 'fetch', async () =>
    Response.json({ error: 'Unauthorized' }, { status: 401 }),
  )

  await apiFetch('/api/sessions')
  await apiFetch('/api/runs')

  assert.equal(unauthorizedCount, 1)
  assert.equal(fetchMock.mock.callCount(), 2)
  removeHandler()
})

test('allows a later authenticated session to report a new expiry', async () => {
  let unauthorizedCount = 0
  const removeHandler = setUnauthorizedHandler(() => {
    unauthorizedCount += 1
  })
  mock.method(globalThis, 'fetch', async () =>
    Response.json({ error: 'Unauthorized' }, { status: 401 }),
  )

  await apiFetch('/api/sessions')
  resetUnauthorizedNotification()
  await apiFetch('/api/sessions')

  assert.equal(unauthorizedCount, 2)
  removeHandler()
})

test('parses structured API errors into a stable error message', async () => {
  await assert.rejects(
    () => parseJsonResponse(Response.json({ error: 'Session not found' }, { status: 404 })),
    /Session not found/,
  )
})
