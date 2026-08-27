import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ZodError } from 'zod'
import type { ChatMessage } from '@ai-agent-pro/shared/type.js'
import { updateRetrievalIntent } from './extract-retrieval-intent.js'
import type { RetrievalIntent } from './retrieval-intent.js'

const currentIntent: RetrievalIntent = {
  target: 'Agent context engineering 教程',
  contentType: '教程',
  hardConstraints: ['适合初学者', '包含完整示例'],
  exclusions: ['只介绍框架用法'],
  preferences: ['使用 TypeScript'],
  ambiguities: [],
  language: '中文',
  timeRange: '最近两年',
}

test('adds an exclusion without changing unrelated fields', async () => {
  const controller = new AbortController()

  async function requestModel(messages: ChatMessage[], signal: AbortSignal) {
    assert.equal(signal, controller.signal)
    assert.equal(messages[0]?.role, 'system')
    assert.match(messages[0]?.content ?? '', /只输出需要修改的字段/)

    const request = JSON.parse(messages[1]?.content ?? '')
    assert.deepEqual(request.currentIntent, currentIntent)
    assert.equal(request.instruction, '另外排除视频教程')

    return JSON.stringify({
      exclusions: ['只介绍框架用法', '视频教程'],
    })
  }

  const result = await updateRetrievalIntent(
    currentIntent,
    '另外排除视频教程',
    controller.signal,
    requestModel,
  )

  assert.deepEqual(result, {
    ...currentIntent,
    exclusions: ['只介绍框架用法', '视频教程'],
  })
})

test('moves a preference to hard constraints', async () => {
  const result = await updateRetrievalIntent(
    currentIntent,
    'TypeScript 必须有',
    new AbortController().signal,
    async () =>
      JSON.stringify({
        hardConstraints: ['适合初学者', '包含完整示例', '使用 TypeScript'],
        preferences: [],
      }),
  )

  assert.deepEqual(result.hardConstraints, ['适合初学者', '包含完整示例', '使用 TypeScript'])
  assert.deepEqual(result.preferences, [])
})

test('removes a scalar restriction with null', async () => {
  const result = await updateRetrievalIntent(
    currentIntent,
    '不限制发布时间了',
    new AbortController().signal,
    async () => JSON.stringify({ timeRange: null }),
  )

  assert.equal(result.timeRange, null)
  assert.deepEqual(result.hardConstraints, currentIntent.hardConstraints)
})

test('rejects an empty instruction before requesting the model', async () => {
  let requested = false

  await assert.rejects(
    updateRetrievalIntent(currentIntent, '   ', new AbortController().signal, async () => {
      requested = true
      return '{}'
    }),
    /Retrieval intent update must not be empty/,
  )

  assert.equal(requested, false)
})

test('rejects an empty model response', async () => {
  await assert.rejects(
    updateRetrievalIntent(
      currentIntent,
      '增加一个条件',
      new AbortController().signal,
      async () => '   ',
    ),
    /Model returned an empty retrieval intent update/,
  )
})

test('rejects malformed JSON from the model', async () => {
  await assert.rejects(
    updateRetrievalIntent(
      currentIntent,
      '增加一个条件',
      new AbortController().signal,
      async () => '{',
    ),
    SyntaxError,
  )
})

test('rejects a patch with unknown fields', async () => {
  await assert.rejects(
    updateRetrievalIntent(currentIntent, '把分数改成 100', new AbortController().signal, async () =>
      JSON.stringify({ score: 100 }),
    ),
    ZodError,
  )
})

test('passes model request failures to the caller', async () => {
  await assert.rejects(
    updateRetrievalIntent(currentIntent, '增加一个条件', new AbortController().signal, async () => {
      throw new Error('network failed')
    }),
    /network failed/,
  )
})

test('forwards an aborted signal to the model request', async () => {
  const controller = new AbortController()
  controller.abort()

  await assert.rejects(
    updateRetrievalIntent(
      currentIntent,
      '增加一个条件',
      controller.signal,
      async (_messages: ChatMessage[], signal: AbortSignal) => {
        signal.throwIfAborted()
        return '{}'
      },
    ),
    { name: 'AbortError' },
  )
})
