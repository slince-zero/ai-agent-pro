import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { ModelClient } from '../runtime/model-client/types.js'
import type { ServerEvent } from '../sse/events.js'
import type { runAgent } from './agent.js'
import type { createSessionService } from './session-service.js'

process.env.OPENAI_API_KEY = 'test-api-key'
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test'

const { RunStatus, SessionStatus, ToolCallStatus } = await import('../generated/prisma/client.js')
const { createChatService } = await import('./chat-service.js')

const session = {
  id: 'session_1',
  title: 'Trace session',
  status: SessionStatus.ACTIVE,
  createdAt: new Date('2026-06-17T07:00:00.000Z'),
  updatedAt: new Date('2026-06-17T07:01:00.000Z'),
}

function createFakeSessionService() {
  return {
    createUserMessage: async () => ({
      id: 'msg_user',
      role: 'USER',
      content: 'Hello',
      createdAt: session.createdAt,
    }),
    updateTitleFromMessageIfNeeded: async () => session,
    getRecentClientMessages: async () => [{ role: 'user' as const, content: 'Hello' }],
    createAssistantMessage: async () => ({
      id: 'msg_assistant',
      role: 'ASSISTANT',
      content: 'Hi',
      createdAt: session.updatedAt,
    }),
    touchSession: async () => session,
  } as unknown as ReturnType<typeof createSessionService>
}

const runAgentFn: typeof runAgent = async ({ onEvent }) => {
  await onEvent({ type: 'text', text: 'Hi' })
  return { inputTokens: 3, outputTokens: 4 }
}

const runAgentWithFailedTool: typeof runAgent = async ({ onEvent }) => {
  await onEvent({
    type: 'tool_call',
    toolCallId: 'call_1',
    name: 'web_fetch',
    args: { url: 'https://example.com' },
  })
  await onEvent({
    type: 'tool_result',
    toolCallId: 'call_1',
    name: 'web_fetch',
    preview: '工具执行出错',
    result: '工具执行出错：network unavailable',
    status: 'failed',
    durationMs: 123,
    error: 'network unavailable',
  })
  return { inputTokens: 1, outputTokens: 2 }
}

test('emits run_id before streamed agent events', async () => {
  const agentRunUpdates: unknown[] = []
  const fakeDb = {
    agentRun: {
      create: async () => ({ id: 'run_1' }),
      update: async (args: unknown) => {
        agentRunUpdates.push(args)
        return { id: 'run_1' }
      },
    },
    toolCall: {
      create: async () => ({ id: 'tool_1' }),
      update: async () => ({ id: 'tool_1' }),
    },
  }
  const service = createChatService({
    db: fakeDb,
    model: 'test-model',
    calculateRunCost: () => 0.001,
    runAgentFn,
    sessionService: createFakeSessionService(),
  })
  const events: ServerEvent[] = []

  const result = await service.sendMessage({
    content: 'Hello',
    modelClient: {} as ModelClient,
    session,
    signal: new AbortController().signal,
    onEvent: (event) => {
      events.push(event)
    },
  })

  assert.deepEqual(events, [
    { type: 'run_id', runId: 'run_1' },
    { type: 'text', text: 'Hi' },
  ])
  assert.deepEqual(result, {
    inputTokens: 3,
    outputTokens: 4,
    cost: 0.001,
  })
  assert.equal(
    (agentRunUpdates[0] as { data?: { status?: string } }).data?.status,
    RunStatus.COMPLETED,
  )
})

test('persists failed tool results with duration and error details', async () => {
  const toolCreates: unknown[] = []
  const toolUpdates: unknown[] = []
  const fakeDb = {
    agentRun: {
      create: async () => ({ id: 'run_1' }),
      update: async () => ({ id: 'run_1' }),
    },
    toolCall: {
      create: async (args: unknown) => {
        toolCreates.push(args)
        return { id: 'tool_1' }
      },
      update: async (args: unknown) => {
        toolUpdates.push(args)
        return { id: 'tool_1' }
      },
    },
  }
  const service = createChatService({
    db: fakeDb,
    model: 'test-model',
    calculateRunCost: () => 0.001,
    runAgentFn: runAgentWithFailedTool,
    sessionService: createFakeSessionService(),
  })
  const events: ServerEvent[] = []

  await service.sendMessage({
    content: 'Hello',
    modelClient: {} as ModelClient,
    session,
    signal: new AbortController().signal,
    onEvent: (event) => {
      events.push(event)
    },
  })

  assert.equal(toolCreates.length, 1)
  assert.deepEqual((toolUpdates[0] as { data?: unknown }).data, {
    result: '工具执行出错：network unavailable',
    status: ToolCallStatus.FAILED,
    error: 'network unavailable',
    durationMs: 123,
    finishedAt: (toolUpdates[0] as { data: { finishedAt: Date } }).data.finishedAt,
  })
  assert.deepEqual(events[2], {
    type: 'tool_result',
    toolCallId: 'call_1',
    name: 'web_fetch',
    preview: '工具执行出错',
    status: 'failed',
    durationMs: 123,
    error: 'network unavailable',
  })
})
