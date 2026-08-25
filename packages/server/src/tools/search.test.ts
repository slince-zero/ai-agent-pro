import assert from 'node:assert/strict'
import { test } from 'node:test'
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

test('fails explicitly while no search source is configured', async () => {
  await assert.rejects(
    search({ query: 'Agent 教程' }, new AbortController().signal),
    /Search is not implemented/,
  )
})

test('honors cancellation before starting a search', async () => {
  const controller = new AbortController()
  controller.abort()

  await assert.rejects(search({ query: 'Agent 教程' }, controller.signal), {
    name: 'AbortError',
  })
})
