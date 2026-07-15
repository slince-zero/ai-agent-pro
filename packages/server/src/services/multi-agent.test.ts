import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { ModelClient, ModelMessage, ModelStreamChunk } from '../runtime/model-client/types.js'
import type { AgentEvent, RunAgentOptions } from '../runtime/types.js'
import type { ToolDefinition } from '../tools/types.js'
import type { MultiAgentStageEvent } from './multi-agent.js'

process.env.OPENAI_API_KEY = 'test-api-key'
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test'

const { runMultiAgentWorkflow } = await import('./multi-agent.js')

function streamFrom(chunks: ModelStreamChunk[]) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) yield chunk
    },
  }
}

function createFakeModelClient(streams: ReturnType<typeof streamFrom>[]) {
  const requests: { messages: ModelMessage[]; tools: ToolDefinition[] }[] = []
  const modelClient: ModelClient = {
    async streamChat(request) {
      requests.push({ messages: request.messages, tools: request.tools })
      const stream = streams.shift()
      if (!stream) throw new Error('No fake stream configured')
      return stream
    },
  }
  return { modelClient, requests }
}

test('runs planner, executor and critic while only streaming the reviewed answer', async () => {
  const { modelClient, requests } = createFakeModelClient([
    streamFrom([
      {
        choices: [{ delta: { content: '1. Inspect\n2. Answer' }, finishReason: 'stop' }],
        usage: { inputTokens: 2, outputTokens: 1 },
      },
    ]),
    streamFrom([
      {
        choices: [{ delta: { content: '<p>Final answer</p>' }, finishReason: 'stop' }],
        usage: { inputTokens: 4, outputTokens: 3 },
      },
    ]),
  ])
  const stageEvents: MultiAgentStageEvent[] = []
  const agentEvents: AgentEvent[] = []
  const executorRequests: RunAgentOptions[] = []

  const usage = await runMultiAgentWorkflow({
    modelClient,
    messages: [{ role: 'user', content: 'Review this project' }],
    signal: new AbortController().signal,
    onEvent: (event) => {
      agentEvents.push(event)
    },
    onStageEvent: (event) => {
      stageEvents.push(event)
    },
    runExecutor: async (request) => {
      executorRequests.push(request)
      await request.onEvent({
        type: 'tool_call',
        toolCallId: 'call_1',
        name: 'github_repository_lookup',
        args: { repository: 'slince-zero/ai-agent-pro' },
      })
      await request.onEvent({ type: 'text', text: '<p>Draft answer</p>' })
      return { inputTokens: 3, outputTokens: 2 }
    },
  })

  assert.deepEqual(usage, { inputTokens: 9, outputTokens: 6 })
  assert.equal(requests.length, 2)
  assert.deepEqual(
    requests.map((request) => request.tools),
    [[], []],
  )
  assert.match(requests[0]?.messages[0]?.content ?? '', /Planner/)
  assert.match(requests[1]?.messages[0]?.content ?? '', /Critic/)
  assert.match(executorRequests[0]?.systemPrompt ?? '', /Executor/)
  assert.match(executorRequests[0]?.systemPrompt ?? '', /1\. Inspect/)
  assert.deepEqual(agentEvents, [
    {
      type: 'tool_call',
      toolCallId: 'call_1',
      name: 'github_repository_lookup',
      args: { repository: 'slince-zero/ai-agent-pro' },
    },
    { type: 'text', text: '<p>Final answer</p>' },
  ])
  assert.deepEqual(
    stageEvents.map(({ role, status }) => ({ role, status })),
    [
      { role: 'planner', status: 'running' },
      { role: 'planner', status: 'completed' },
      { role: 'executor', status: 'running' },
      { role: 'executor', status: 'completed' },
      { role: 'critic', status: 'running' },
      { role: 'critic', status: 'completed' },
    ],
  )
  assert.equal(stageEvents[1]?.output, '1. Inspect\n2. Answer')
  assert.equal(stageEvents[3]?.output, '<p>Draft answer</p>')
  assert.equal(stageEvents[5]?.output, '<p>Final answer</p>')
})

test('marks the active stage failed and stops before critic when executor fails', async () => {
  const { modelClient, requests } = createFakeModelClient([
    streamFrom([
      {
        choices: [{ delta: { content: 'Plan' }, finishReason: 'stop' }],
      },
    ]),
  ])
  const stageEvents: MultiAgentStageEvent[] = []

  await assert.rejects(
    runMultiAgentWorkflow({
      modelClient,
      messages: [{ role: 'user', content: 'Do work' }],
      signal: new AbortController().signal,
      onEvent: () => undefined,
      onStageEvent: (event) => {
        stageEvents.push(event)
      },
      runExecutor: async () => {
        throw new Error('executor unavailable')
      },
    }),
    /executor unavailable/,
  )

  assert.equal(requests.length, 1)
  assert.deepEqual(stageEvents.at(-1), {
    role: 'executor',
    sequence: 1,
    status: 'failed',
    error: 'executor unavailable',
  })
})
