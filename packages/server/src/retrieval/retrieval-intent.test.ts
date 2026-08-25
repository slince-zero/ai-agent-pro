import assert from 'node:assert/strict'
import { test } from 'node:test'
import { retrievalIntentSchema } from './retrieval-intent.js'

test('keeps hard constraints, exclusions and preferences separate', () => {
  const intent = retrievalIntentSchema.parse({
    target: 'Agent context engineering 教程',
    contentType: '教程',
    hardConstraints: ['适合初学者', '包含完整示例'],
    exclusions: ['只介绍框架用法'],
    preferences: ['使用 TypeScript'],
    ambiguities: [],
    language: '中文',
    timeRange: null,
  })

  assert.deepEqual(intent.preferences, ['使用 TypeScript'])
  assert.equal(intent.hardConstraints.includes('使用 TypeScript'), false)
})

test('trims condition text', () => {
  const intent = retrievalIntentSchema.parse({
    target: '  Agent 教程  ',
    contentType: null,
    hardConstraints: ['  包含示例  '],
    exclusions: [],
    preferences: [],
    ambiguities: [],
    language: null,
    timeRange: null,
  })

  assert.equal(intent.target, 'Agent 教程')
  assert.deepEqual(intent.hardConstraints, ['包含示例'])
})

test('rejects an empty target', () => {
  const result = retrievalIntentSchema.safeParse({
    target: '   ',
    contentType: null,
    hardConstraints: [],
    exclusions: [],
    preferences: [],
    ambiguities: [],
    language: null,
    timeRange: null,
  })

  assert.equal(result.success, false)
})

test('rejects unknown fields', () => {
  const result = retrievalIntentSchema.safeParse({
    target: 'Agent 教程',
    contentType: null,
    hardConstraints: [],
    exclusions: [],
    preferences: [],
    ambiguities: [],
    language: null,
    timeRange: null,
    score: 100,
  })

  assert.equal(result.success, false)
})

test('rejects an oversized condition', () => {
  const result = retrievalIntentSchema.safeParse({
    target: 'Agent 教程',
    contentType: null,
    hardConstraints: ['a'.repeat(201)],
    exclusions: [],
    preferences: [],
    ambiguities: [],
    language: null,
    timeRange: null,
  })

  assert.equal(result.success, false)
})
