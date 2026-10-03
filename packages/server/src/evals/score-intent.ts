import { isDeepStrictEqual } from 'node:util'
import type { RetrievalIntent } from '../retrieval/retrieval-intent.js'
import type { IntentExpect, Match } from './dataset.js'

/** 一条检查的结果。name 要能单独读懂，报告里只列失败的那几条 */
export type Check = {
  name: string
  pass: boolean
  /** 失败时给出实际值，省得回头翻原始输出 */
  actual?: unknown
}

const listFields = ['hardConstraints', 'exclusions', 'preferences', 'ambiguities'] as const
const scalarFields = ['contentType', 'language', 'timeRange'] as const

function normalize(value: string) {
  return value.toLowerCase().replace(/\s+/g, '')
}

function alternatives(match: Match) {
  return typeof match === 'string' ? [match] : match
}

export function describeMatch(match: Match) {
  return alternatives(match).join('|')
}

/** 忽略大小写和空白的子串匹配；给了几种说法时命中任意一种即可 */
export function matches(text: string, match: Match) {
  const haystack = normalize(text)

  return alternatives(match).some((needle) => haystack.includes(normalize(needle)))
}

/**
 * 按期望逐项检查一份意图。
 *
 * 不给总分，只给一串能单独读懂的检查：评测要回答的是"哪一类条件分错了"，
 * 一个 0.83 说明不了这件事。
 */
export function scoreIntent(intent: RetrievalIntent, expect: IntentExpect): Check[] {
  const checks: Check[] = []

  if (expect.target !== undefined) {
    checks.push({
      name: `target 包含 ${describeMatch(expect.target)}`,
      pass: matches(intent.target, expect.target),
      actual: intent.target,
    })
  }

  for (const field of scalarFields) {
    const expected = expect[field]
    const actual = intent[field]

    if (expected === undefined) continue

    if (expected === null) {
      checks.push({ name: `${field} 为 null`, pass: actual === null, actual })
      continue
    }

    checks.push({
      name: `${field} 包含 ${describeMatch(expected)}`,
      pass: actual !== null && matches(actual, expected),
      actual,
    })
  }

  for (const field of listFields) {
    const expected = expect[field]
    const actual = intent[field]

    if (!expected) continue

    if (expected.empty !== undefined) {
      checks.push({
        name: expected.empty ? `${field} 为空` : `${field} 非空`,
        pass: expected.empty === (actual.length === 0),
        actual,
      })
    }

    for (const match of expected.has ?? []) {
      checks.push({
        name: `${field} 有一项包含 ${describeMatch(match)}`,
        pass: actual.some((item) => matches(item, match)),
        actual,
      })
    }

    for (const match of expected.lacks ?? []) {
      checks.push({
        name: `${field} 不含 ${describeMatch(match)}`,
        pass: !actual.some((item) => matches(item, match)),
        actual,
      })
    }
  }

  return checks
}

/** 条件更新不该碰的字段，逐个和更新前比 */
export function scoreUnchanged(
  before: RetrievalIntent,
  after: RetrievalIntent,
  fields: (keyof RetrievalIntent)[],
): Check[] {
  return fields.map((field) => ({
    name: `${field} 保持不变`,
    pass: isDeepStrictEqual(before[field], after[field]),
    actual: after[field],
  }))
}
