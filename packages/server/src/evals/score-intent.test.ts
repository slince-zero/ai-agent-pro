import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { RetrievalIntent } from '../retrieval/retrieval-intent.js'
import { matches, scoreIntent, scoreUnchanged } from './score-intent.js'

const intent: RetrievalIntent = {
  target: 'Agent context engineering 教程',
  contentType: '教程',
  hardConstraints: ['适合初学者', '包含完整示例'],
  exclusions: ['只介绍框架用法'],
  preferences: ['使用 TypeScript'],
  ambiguities: [],
  language: null,
  timeRange: null,
}

function failed(checks: { name: string; pass: boolean }[]) {
  return checks.filter((check) => !check.pass).map((check) => check.name)
}

test('matches any alternative, ignoring case and whitespace', () => {
  assert.equal(matches('使用 TypeScript', 'typescript'), true)
  assert.equal(matches('Type Script 优先', 'TypeScript'), true)
  assert.equal(matches('适合新手', ['初学', '新手']), true)
  assert.equal(matches('包含完整示例', ['视频', '音频']), false)
})

test('passes when every expectation holds', () => {
  const checks = scoreIntent(intent, {
    target: 'context',
    contentType: '教程',
    language: null,
    hardConstraints: { has: [['初学', '新手'], '示例'], lacks: ['TypeScript'] },
    exclusions: { has: ['框架'] },
    preferences: { has: ['TypeScript'] },
    ambiguities: { empty: true },
  })

  assert.deepEqual(failed(checks), [])
  assert.equal(checks.length, 9)
})

test('catches a preference promoted to a hard constraint', () => {
  const promoted = { ...intent, hardConstraints: [...intent.hardConstraints, '使用 TypeScript'] }

  assert.deepEqual(failed(scoreIntent(promoted, { hardConstraints: { lacks: ['TypeScript'] } })), [
    'hardConstraints 不含 TypeScript',
  ])
})

test('distinguishes a required null from a missing check', () => {
  const withLanguage = { ...intent, language: '中文' }

  assert.deepEqual(failed(scoreIntent(withLanguage, { language: null })), ['language 为 null'])
  assert.deepEqual(scoreIntent(withLanguage, {}), [])
})

test('fails a scalar match against null', () => {
  assert.deepEqual(failed(scoreIntent(intent, { timeRange: '2024' })), ['timeRange 包含 2024'])
})

test('checks emptiness both ways', () => {
  assert.deepEqual(failed(scoreIntent(intent, { ambiguities: { empty: false } })), [
    'ambiguities 非空',
  ])
  assert.deepEqual(failed(scoreIntent(intent, { exclusions: { empty: true } })), [
    'exclusions 为空',
  ])
})

test('reports fields an update should not have touched', () => {
  const after = { ...intent, preferences: [], timeRange: '最近两年' }

  assert.deepEqual(
    failed(scoreUnchanged(intent, after, ['target', 'preferences', 'timeRange', 'exclusions'])),
    ['preferences 保持不变', 'timeRange 保持不变'],
  )
})
