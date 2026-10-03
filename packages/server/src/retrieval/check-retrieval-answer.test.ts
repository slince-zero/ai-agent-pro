import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { EvidenceSource, RetrievalIntent } from '@ai-agent-pro/shared/type.js'
import { checkRetrievalAnswer } from './check-retrieval-answer.js'

const intent: RetrievalIntent = {
  target: 'Express 5 入门资料',
  contentType: '教程',
  hardConstraints: ['官方来源', '中文'],
  exclusions: ['Express 4'],
  preferences: [],
  ambiguities: [],
  language: '中文',
  timeRange: null,
}
const source: EvidenceSource = {
  ref: 1,
  title: 'Express 5',
  url: 'https://example.com/5',
  snippet: '',
  read: true,
  chars: 100,
}
const answer = '推荐这篇入门资料 [1]。\n条件核对\n已确认：官方来源、中文、排除 Express 4 [1]'

test('accepts a complete checklist with citations to this run’s read pages', () => {
  assert.deepEqual(checkRetrievalAnswer(answer, [source], intent), [])
})
test('does not accept a previous answer’s citation as current evidence', () => {
  assert.ok(checkRetrievalAnswer(answer, [], intent).some((issue) => issue.includes('不属于本轮')))
})
test('search snippets cannot support final citations or confirmed claims', () => {
  const issues = checkRetrievalAnswer(answer, [{ ...source, read: false }], intent)
  assert.ok(issues.some((issue) => issue.includes('未读取正文')))
  assert.ok(issues.some((issue) => issue.includes('每条“已确认”')))
})
test('a bare source url cannot bypass validation by using inline code', () => {
  assert.ok(
    checkRetrievalAnswer(`${answer}\n来源：\`https://example.com/5\``, [source], intent).some(
      (issue) => issue.includes('裸链接'),
    ),
  )
})
test('requires every active condition but not a condition removed in the follow-up', () => {
  assert.deepEqual(checkRetrievalAnswer(answer, [source], intent), [])
  assert.ok(
    checkRetrievalAnswer(answer, [source], {
      ...intent,
      hardConstraints: [...intent.hardConstraints, '可运行示例'],
    }).some((issue) => issue.includes('可运行示例')),
  )
})
test('allows an honest unknown result without inventing sources', () => {
  assert.deepEqual(
    checkRetrievalAnswer(
      '无法确认：未找到合格结果。\n条件核对\n无法确认：官方来源、中文、排除 Express 4，缺少可读取正文。',
      [],
      intent,
    ),
    [],
  )
})
test('code examples containing bracketed numbers are not source citations', () => {
  assert.deepEqual(
    checkRetrievalAnswer(
      `${answer}\n\`items[999]\`\n\`\`\`ts\nitems[998]\n\`\`\``,
      [source],
      intent,
    ),
    [],
  )
})
