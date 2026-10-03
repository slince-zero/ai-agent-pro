import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { AgentStreamEvent, EvidenceSource } from '@ai-agent-pro/shared/type.js'
import { collectTrajectory, scoreAgentExpect, scoreInvariants } from './score-agent.js'
import type { Trajectory } from './score-agent.js'

const readSource: EvidenceSource = {
  ref: 1,
  url: 'https://expressjs.com/en/guide/migrating-5.html',
  title: 'Migrating to Express 5',
  snippet: 'Express 5 requires Node.js 18 or higher.',
  read: true,
  chars: 4200,
}

const searchedSource: EvidenceSource = {
  ref: 2,
  url: 'https://example.com/express-5',
  title: 'Express 5 notes',
  snippet: 'Node 18+',
  read: false,
}

function trajectory(overrides: Partial<Trajectory>): Trajectory {
  return {
    rounds: 2,
    toolCalls: [],
    toolResults: [],
    answer: '',
    evidence: [readSource, searchedSource],
    done: true,
    inputTokens: 0,
    outputTokens: 0,
    ...overrides,
  }
}

function failed(checks: { name: string; pass: boolean }[]) {
  return checks.filter((check) => !check.pass).map((check) => check.name)
}

async function* stream(events: AgentStreamEvent[]) {
  yield* events
}

test('keeps only the last round as the answer and sums usage', async () => {
  const result = await collectTrajectory(
    stream([
      { type: 'round_start', round: 1 },
      { type: 'text_delta', delta: '我先搜一下。' },
      { type: 'usage', usage: { inputTokens: 100, outputTokens: 10, totalTokens: 110 } },
      { type: 'tool_call', id: 'a', name: 'search', arguments: '{"query":"express 5"}' },
      { type: 'tool_result', id: 'a', name: 'search', ok: true },
      { type: 'round_start', round: 2 },
      { type: 'text_delta', delta: 'Node.js 18 ' },
      { type: 'text_delta', delta: '[1]' },
      { type: 'usage', usage: { inputTokens: 300, outputTokens: 20, totalTokens: 320 } },
      { type: 'evidence', sources: [readSource] },
      { type: 'done' },
    ]),
  )

  assert.equal(result.answer, 'Node.js 18 [1]')
  assert.equal(result.rounds, 2)
  assert.equal(result.inputTokens, 400)
  assert.equal(result.outputTokens, 30)
  assert.deepEqual(result.toolCalls, [{ name: 'search', arguments: '{"query":"express 5"}' }])
  assert.deepEqual(result.evidence, [readSource])
  assert.equal(result.done, true)
})

test('records a loop failure instead of throwing', async () => {
  async function* broken(): AsyncGenerator<AgentStreamEvent> {
    yield { type: 'round_start', round: 1 }
    throw new Error('Agent loop ended without an answer')
  }

  const result = await collectTrajectory(broken())

  assert.equal(result.done, false)
  assert.equal(result.error, 'Error: Agent loop ended without an answer')
  assert.deepEqual(failed(scoreInvariants(result)), ['正常结束（done）', '答案非空'])
})

test('accepts an answer whose confirmed claims cite pages that were read', () => {
  const answer = [
    'Express 5 要求 Node.js 18 及以上 [1]。',
    '',
    '条件核对',
    '**已确认**',
    '- 已确认：最低版本 —— Node.js 18 [1][2]',
    '- 无法确认：是否支持 Node 16 —— 没有找到说明',
  ].join('\n')

  assert.deepEqual(failed(scoreInvariants(trajectory({ answer }))), [])
})

test('rejects a confirmed claim backed only by a search snippet', () => {
  const answer = '- 已确认：最低版本 —— Node.js 18 [2]'

  assert.deepEqual(failed(scoreInvariants(trajectory({ answer }))), [
    '"已确认"都引用了读过正文的来源',
  ])
})

test('rejects citations that point nowhere and bare links', () => {
  const answer = '见 [3] 和 https://expressjs.com'

  assert.deepEqual(failed(scoreInvariants(trajectory({ answer }))), [
    '引用编号都能对上来源',
    '没有裸链接',
  ])
})

test('checks the case expectations', () => {
  const run = trajectory({
    answer: 'Express 5 要求 Node.js 18。',
    toolCalls: [{ name: 'search', arguments: '{}' }],
    toolResults: [{ name: 'read_page', ok: false }],
  })

  assert.deepEqual(
    failed(
      scoreAgentExpect(run, {
        tools: 'none',
        readPage: true,
        checklist: true,
        answerHas: ['18', ['Koa', 'koa']],
        answerLacks: ['Express'],
      }),
    ),
    [
      '没有调用工具',
      '至少成功读回一页正文',
      '有"条件核对"一段',
      '答案包含 Koa|koa',
      '答案不含 Express',
    ],
  )
})
