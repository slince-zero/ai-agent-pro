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

test('requests Tavily and maps successful search results', async () => {
  let requestCount = 0

  const results = await search(
    { query: 'TypeScript Agent 教程' },
    new AbortController().signal,
    {
      apiKey: 'test-key',
      request: async (input, init) => {
        requestCount += 1

        assert.equal(input.toString(), 'https://api.tavily.com/search')
        assert.equal(init?.method, 'POST')
        assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer test-key')
        assert.equal(new Headers(init?.headers).get('Content-Type'), 'application/json')
        assert.equal(typeof init?.body, 'string')
        assert.deepEqual(JSON.parse(init?.body as string), {
          query: 'TypeScript Agent 教程',
          topic: 'general',
          search_depth: 'basic',
          max_results: 5,
          include_answer: false,
          include_raw_content: false,
          include_images: false,
        })
        assert.ok(init?.signal)

        return new Response(
          JSON.stringify({
            results: [
              {
                title: 'Context Engineering Guide',
                url: 'https://example.com/context-engineering',
                content: 'A TypeScript tutorial with complete examples.',
                score: 0.91,
              },
            ],
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
            },
          },
        )
      },
    },
  )

  assert.equal(requestCount, 1)
  assert.deepEqual(results, [
    {
      title: 'Context Engineering Guide',
      url: 'https://example.com/context-engineering',
      snippet: 'A TypeScript tutorial with complete examples.',
    },
  ])
})

test('returns an empty list when Tavily finds no results', async () => {
  const results = await search(
    { query: '不存在的 Agent 教程' },
    new AbortController().signal,
    {
      apiKey: 'test-key',
      request: async () => Response.json({ results: [] }),
    },
  )

  assert.deepEqual(results, [])
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
