import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildSearchQueries } from './build-search-queries.js'
import type { RetrievalIntent } from './retrieval-intent.js'

const baseIntent: RetrievalIntent = {
  target: 'Agent context engineering',
  contentType: '教程',
  hardConstraints: ['适合初学者', '包含完整示例'],
  exclusions: ['只介绍框架用法'],
  preferences: ['使用 TypeScript'],
  ambiguities: ['Agent 框架未指定'],
  language: '中文',
  timeRange: null,
}

test('builds required and preferred search queries', () => {
  assert.deepEqual(buildSearchQueries(baseIntent), [
    'Agent context engineering 教程 适合初学者 包含完整示例 中文',
    'Agent context engineering 教程 适合初学者 包含完整示例 中文 使用 TypeScript',
  ])
})

test('does not put exclusions or ambiguities into search queries', () => {
  const queries = buildSearchQueries(baseIntent)

  assert.equal(
    queries.some((query) => query.includes('只介绍框架用法')),
    false,
  )
  assert.equal(
    queries.some((query) => query.includes('Agent 框架未指定')),
    false,
  )
})

test('returns one query when there are no preferences', () => {
  assert.deepEqual(
    buildSearchQueries({
      ...baseIntent,
      contentType: null,
      hardConstraints: [],
      preferences: [],
      language: null,
      timeRange: null,
    }),
    ['Agent context engineering'],
  )
})

test('limits every query to the search input length', () => {
  const queries = buildSearchQueries({
    ...baseIntent,
    target: 'a'.repeat(300),
  })

  assert.equal(
    queries.every((query) => query.length <= 200),
    true,
  )
})
