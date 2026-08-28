import assert from 'node:assert/strict'
import { test } from 'node:test'
import { z } from 'zod'
import { search, searchInputSchema } from './search.js'

test('parses valid search input', () => {
  const result = searchInputSchema.parse({
    query: '  TypeScript Agent 教程  ',
  })

  assert.deepEqual(result, {
    query: 'TypeScript Agent 教程',
  })
})

test('rejects an empty query', () => {
  const result = searchInputSchema.safeParse({
    query: '   ',
  })

  assert.equal(result.success, false)
})

test('rejects unknown properties', () => {
  const result = searchInputSchema.safeParse({
    query: 'Agent 教程',
    limit: 100,
  })

  assert.equal(result.success, false)
})

test('rejects a missing Tavily API key', async () => {
  await assert.rejects(
    search({ query: 'Agent 教程' }, new AbortController().signal, { apiKey: '' }),
    /TAVILY_API_KEY is not configured/,
  )
})

test('rejects a Tavily HTTP error', async () => {
  await assert.rejects(
    search({ query: 'Agent 教程' }, new AbortController().signal, {
      apiKey: 'test-key',
      request: async () => new Response('', { status: 429 }),
    }),
    /Tavily search failed with HTTP 429/,
  )
})

test('rejects an invalid Tavily response', async () => {
  await assert.rejects(
    search({ query: 'Agent 教程' }, new AbortController().signal, {
      apiKey: 'test-key',
      request: async () =>
        new Response(JSON.stringify({ results: [{ title: 123 }] }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        }),
    }),
    z.ZodError,
  )
})

test('honors cancellation before starting a search', async () => {
  const controller = new AbortController()
  controller.abort()

  await assert.rejects(search({ query: 'Agent 教程' }, controller.signal), {
    name: 'AbortError',
  })
})
