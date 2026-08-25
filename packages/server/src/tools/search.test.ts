import assert from 'node:assert/strict'
import { test } from 'node:test'
import { searchInputSchema } from './search.js'

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
