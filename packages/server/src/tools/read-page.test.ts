import assert from 'node:assert/strict'
import { test } from 'node:test'
import { z } from 'zod'
import { agentLimits } from '../util.js'
import { readPage, readPageInputSchema } from './read-page.js'

test('rejects invalid or unknown read page arguments', () => {
  assert.equal(readPageInputSchema.safeParse({ url: 'not-a-url' }).success, false)
  assert.equal(readPageInputSchema.safeParse({ url: 'file:///etc/passwd' }).success, false)
  assert.equal(
    readPageInputSchema.safeParse({ url: 'https://example.com', depth: 'advanced' }).success,
    false,
  )
})

test('requests Tavily Extract and maps page content', async () => {
  const result = await readPage(
    { url: 'https://example.com/guide' },
    new AbortController().signal,
    {
      apiKey: 'test-key',
      request: async (input, init) => {
        assert.equal(input.toString(), 'https://api.tavily.com/extract')
        assert.equal(init?.method, 'POST')
        assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer test-key')
        assert.deepEqual(JSON.parse(init?.body as string), {
          urls: ['https://example.com/guide'],
          extract_depth: 'basic',
          format: 'markdown',
          include_images: false,
          timeout: 10,
        })
        assert.ok(init?.signal)

        return Response.json({
          results: [
            {
              url: 'https://example.com/guide',
              raw_content: '  # Complete guide\n\nPage content.  ',
            },
          ],
          failed_results: [],
        })
      },
    },
  )

  assert.deepEqual(result, {
    url: 'https://example.com/guide',
    content: '# Complete guide\n\nPage content.',
    truncated: false,
  })
})

test('truncates oversized page content', async () => {
  const result = await readPage(
    { url: 'https://example.com/large' },
    new AbortController().signal,
    {
      apiKey: 'test-key',
      request: async () =>
        Response.json({
          results: [
            {
              url: 'https://example.com/large',
              raw_content: 'a'.repeat(agentLimits.maxPageContentLength + 1),
            },
          ],
          failed_results: [],
        }),
    },
  )

  assert.equal(result.content.length, agentLimits.maxPageContentLength)
  assert.equal(result.truncated, true)
})

test('rejects a failed page extraction', async () => {
  await assert.rejects(
    readPage({ url: 'https://example.com/failure' }, new AbortController().signal, {
      apiKey: 'test-key',
      request: async () =>
        Response.json({
          results: [],
          failed_results: [
            {
              url: 'https://example.com/failure',
              error: 'Could not extract URL',
            },
          ],
        }),
    }),
    /Could not extract URL/,
  )
})

test('rejects an invalid Tavily Extract response', async () => {
  await assert.rejects(
    readPage({ url: 'https://example.com/guide' }, new AbortController().signal, {
      apiKey: 'test-key',
      request: async () => Response.json({ results: [{ raw_content: 123 }] }),
    }),
    z.ZodError,
  )
})

test('honors cancellation before extracting a page', async () => {
  const controller = new AbortController()
  controller.abort()

  await assert.rejects(readPage({ url: 'https://example.com' }, controller.signal), {
    name: 'AbortError',
  })
})
