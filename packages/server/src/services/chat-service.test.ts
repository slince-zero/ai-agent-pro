import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { ModelClient } from '../runtime/model-client/types.js'
import type { ServerEvent } from '../sse/events.js'
import type { runAgent } from './agent.js'
import type { createMemoryService } from './memory-service.js'
import type { runMultiAgentWorkflow } from './multi-agent.js'
import type { createRagRetrievalService } from './rag-retrieval-service.js'
import type { createSessionService } from './session-service.js'
import type { createSessionSummaryService } from './session-summary-service.js'

process.env.OPENAI_API_KEY = 'test-api-key'
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test'

const {
  AgentStageRole,
  AgentStageStatus,
  AgentWorkflow,
  RunStatus,
  SessionStatus,
  ToolCallStatus,
} = await import('../generated/prisma/client.js')
const { createChatService } = await import('./chat-service.js')
const { createCitationService } = await import('./citation-service.js')

const session = {
  id: 'session_1',
  userId: 'user_1',
  title: 'Trace session',
  status: SessionStatus.ACTIVE,
  createdAt: new Date('2026-06-17T07:00:00.000Z'),
  updatedAt: new Date('2026-06-17T07:01:00.000Z'),
}

type FakeSessionServiceCalls = {
  recentMessageRequests?: { excludeMessageIds?: string[]; sessionId: string; take: number }[]
  updateAssistantRequests?: unknown[]
}

type FakeSummaryServiceCalls = {
  getLatestSummaryRequests?: string[]
  refreshRequests?: string[]
}

type FakeMemoryServiceCalls = {
  contextMemoryRequests?: unknown[]
}

type FakeRagRetrievalServiceCalls = {
  searchRequests?: unknown[]
}

type FakeCitationServiceCalls = {
  replaceRequests?: unknown[]
}

function createFakeSessionService(calls: FakeSessionServiceCalls = {}) {
  return {
    createUserMessage: async () => ({
      id: 'msg_user',
      role: 'USER',
      content: 'Hello',
      createdAt: session.createdAt,
    }),
    updateTitleFromMessageIfNeeded: async () => session,
    getRecentClientMessages: async (
      sessionId: string,
      take: number,
      options?: { excludeMessageIds?: string[] },
    ) => {
      calls.recentMessageRequests?.push({
        sessionId,
        take,
        excludeMessageIds: options?.excludeMessageIds,
      })
      return [{ role: 'user' as const, content: 'Hello' }]
    },
    createAssistantMessage: async () => ({
      id: 'msg_assistant',
      role: 'ASSISTANT',
      content: 'Hi',
      createdAt: session.updatedAt,
    }),
    updateAssistantMessage: async (messageId: string, content: string) => {
      calls.updateAssistantRequests?.push({ messageId, content })
      return {
        id: messageId,
        role: 'ASSISTANT',
        content,
        createdAt: session.updatedAt,
      }
    },
    getLatestRegenerationTarget: async () => ({
      userMessage: {
        id: 'msg_user',
        role: 'USER',
        content: 'Hello',
        createdAt: session.createdAt,
      },
      assistantMessage: {
        id: 'msg_assistant',
        role: 'ASSISTANT',
        content: 'Old answer',
        createdAt: session.updatedAt,
      },
    }),
    touchSession: async () => session,
  } as unknown as ReturnType<typeof createSessionService>
}

function createFakeSummaryService(calls: FakeSummaryServiceCalls = {}) {
  return {
    getLatestSummary: async () => null,
    getLatestSummaryContent: async (sessionId: string) => {
      calls.getLatestSummaryRequests?.push(sessionId)
      return null
    },
    maybeRefreshSessionSummary: async ({ sessionId }: { sessionId: string }) => {
      calls.refreshRequests?.push(sessionId)
      return { created: false, reason: 'below_threshold' as const }
    },
  } as unknown as ReturnType<typeof createSessionSummaryService>
}

function createFakeMemoryService(calls: FakeMemoryServiceCalls = {}) {
  return {
    createMemory: async () => {
      throw new Error('createMemory should not be called by chat service')
    },
    updateMemory: async () => {
      throw new Error('updateMemory should not be called by chat service')
    },
    listMemories: async () => [],
    listContextMemories: async (input: unknown) => {
      calls.contextMemoryRequests?.push(input)
      return [{ content: 'Use pnpm for package scripts.' }]
    },
    invalidateMemory: async () => {
      throw new Error('invalidateMemory should not be called by chat service')
    },
  } as unknown as ReturnType<typeof createMemoryService>
}

function createFakeRagRetrievalService(calls: FakeRagRetrievalServiceCalls = {}) {
  return {
    searchRelevantChunks: async (input: unknown) => {
      calls.searchRequests?.push(input)
      return [
        {
          chunkId: 'chunk_1',
          documentId: 'doc_1',
          content: 'Use pnpm test before opening PRs.',
          title: 'README.md',
          sourceRef: 'README.md#L1-L3',
          uri: 'https://github.com/slince-zero/ai-agent-pro/blob/main/README.md',
        },
      ]
    },
  } as unknown as ReturnType<typeof createRagRetrievalService>
}

function createFakeCitationService(calls: FakeCitationServiceCalls = {}) {
  return {
    createMessageCitations: async () => {
      throw new Error('createMessageCitations should not be called by chat service')
    },
    replaceMessageCitations: async (input: unknown) => {
      calls.replaceRequests?.push(input)
      return [
        {
          id: 'citation_1',
          messageId: 'msg_assistant',
          documentId: 'doc_1',
          chunkId: 'chunk_1',
          title: 'README.md',
          uri: 'https://github.com/slince-zero/ai-agent-pro/blob/main/README.md',
          sourceRef: 'README.md#L1-L3',
          snippet: 'Use pnpm test before opening PRs.',
          metadata: { score: null },
          createdAt: '2026-06-17T07:01:00.000Z',
        },
      ]
    },
  } as unknown as ReturnType<typeof createCitationService>
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

const runMultiAgentWorkflowFn: typeof runMultiAgentWorkflow = async ({ onEvent, onStageEvent }) => {
  await onStageEvent({ role: 'planner', sequence: 0, status: 'running' })
  await onStageEvent({
    role: 'planner',
    sequence: 0,
    status: 'completed',
    output: 'Plan',
    usage: { inputTokens: 1, outputTokens: 2 },
  })
  await onStageEvent({ role: 'executor', sequence: 1, status: 'running' })
  await onStageEvent({
    role: 'executor',
    sequence: 1,
    status: 'completed',
    output: 'Draft',
    usage: { inputTokens: 3, outputTokens: 4 },
  })
  await onStageEvent({ role: 'critic', sequence: 2, status: 'running' })
  await onEvent({ type: 'text', text: 'Reviewed answer' })
  await onStageEvent({
    role: 'critic',
    sequence: 2,
    status: 'completed',
    output: 'Reviewed answer',
    usage: { inputTokens: 5, outputTokens: 6 },
  })
  return { inputTokens: 9, outputTokens: 12 }
}

test('emits run_id before streamed agent events', async () => {
  const agentRunUpdates: unknown[] = []
  const sessionCalls = {
    recentMessageRequests: [] as {
      excludeMessageIds?: string[]
      sessionId: string
      take: number
    }[],
  }
  const summaryCalls = {
    getLatestSummaryRequests: [] as string[],
    refreshRequests: [] as string[],
  }
  const memoryCalls = {
    contextMemoryRequests: [] as unknown[],
  }
  const ragCalls = {
    searchRequests: [] as unknown[],
  }
  const citationCalls = {
    replaceRequests: [] as unknown[],
  }
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
    sessionService: createFakeSessionService(sessionCalls),
    memoryService: createFakeMemoryService(memoryCalls),
    ragRetrievalService: createFakeRagRetrievalService(ragCalls),
    summaryService: createFakeSummaryService(summaryCalls),
    citationService: createFakeCitationService(citationCalls),
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
    {
      type: 'citations',
      citations: [
        {
          id: 'citation_1',
          messageId: 'msg_assistant',
          documentId: 'doc_1',
          chunkId: 'chunk_1',
          title: 'README.md',
          uri: 'https://github.com/slince-zero/ai-agent-pro/blob/main/README.md',
          sourceRef: 'README.md#L1-L3',
          snippet: 'Use pnpm test before opening PRs.',
          metadata: { score: null },
          createdAt: '2026-06-17T07:01:00.000Z',
        },
      ],
    },
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
  assert.deepEqual(sessionCalls.recentMessageRequests, [
    { sessionId: 'session_1', take: 30, excludeMessageIds: [] },
  ])
  assert.deepEqual(memoryCalls.contextMemoryRequests, [
    { userId: 'user_1', sessionId: 'session_1', projectId: undefined },
  ])
  assert.deepEqual(ragCalls.searchRequests, [
    {
      userId: 'user_1',
      projectId: undefined,
      query: 'Hello',
      signal: (ragCalls.searchRequests[0] as { signal: AbortSignal }).signal,
    },
  ])
  assert.equal(
    (ragCalls.searchRequests[0] as { signal: unknown }).signal instanceof AbortSignal,
    true,
  )
  assert.deepEqual(summaryCalls.getLatestSummaryRequests, ['session_1'])
  assert.deepEqual(summaryCalls.refreshRequests, ['session_1'])
  assert.deepEqual(citationCalls.replaceRequests, [
    {
      messageId: 'msg_assistant',
      sources: [
        {
          chunkId: 'chunk_1',
          documentId: 'doc_1',
          content: 'Use pnpm test before opening PRs.',
          title: 'README.md',
          sourceRef: 'README.md#L1-L3',
          uri: 'https://github.com/slince-zero/ai-agent-pro/blob/main/README.md',
        },
      ],
    },
  ])
})

test('regenerates the latest assistant message in place', async () => {
  const agentRunCreates: unknown[] = []
  const agentRunUpdates: unknown[] = []
  const sessionCalls = {
    recentMessageRequests: [] as {
      excludeMessageIds?: string[]
      sessionId: string
      take: number
    }[],
    updateAssistantRequests: [] as unknown[],
  }
  const citationCalls = {
    replaceRequests: [] as unknown[],
  }
  const fakeDb = {
    agentRun: {
      create: async (args: unknown) => {
        agentRunCreates.push(args)
        return { id: 'run_2' }
      },
      update: async (args: unknown) => {
        agentRunUpdates.push(args)
        return { id: 'run_2' }
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
    sessionService: createFakeSessionService(sessionCalls),
    memoryService: createFakeMemoryService(),
    ragRetrievalService: createFakeRagRetrievalService(),
    summaryService: createFakeSummaryService(),
    citationService: createFakeCitationService(citationCalls),
  })
  const events: ServerEvent[] = []

  const result = await service.regenerateLastAssistant({
    modelClient: {} as ModelClient,
    session,
    signal: new AbortController().signal,
    onEvent: (event) => {
      events.push(event)
    },
  })

  assert.deepEqual(result, {
    inputTokens: 3,
    outputTokens: 4,
    cost: 0.001,
  })
  assert.deepEqual(agentRunCreates[0], {
    data: {
      sessionId: 'session_1',
      userMessageId: 'msg_user',
      model: 'test-model',
    },
  })
  assert.deepEqual(sessionCalls.recentMessageRequests, [
    { sessionId: 'session_1', take: 30, excludeMessageIds: ['msg_assistant'] },
  ])
  assert.deepEqual(sessionCalls.updateAssistantRequests, [
    {
      messageId: 'msg_assistant',
      content: 'Hi',
    },
  ])
  assert.equal(
    (agentRunUpdates[0] as { data?: { assistantMessageId?: string; status?: string } }).data
      ?.assistantMessageId,
    'msg_assistant',
  )
  assert.equal(
    (agentRunUpdates[0] as { data?: { status?: string } }).data?.status,
    RunStatus.COMPLETED,
  )
  assert.equal((events[0] as { type?: string }).type, 'run_id')
  assert.equal((events[1] as { type?: string }).type, 'text')
  assert.equal((events[2] as { type?: string }).type, 'citations')
  assert.deepEqual(citationCalls.replaceRequests, [
    {
      messageId: 'msg_assistant',
      sources: [
        {
          chunkId: 'chunk_1',
          documentId: 'doc_1',
          content: 'Use pnpm test before opening PRs.',
          title: 'README.md',
          sourceRef: 'README.md#L1-L3',
          uri: 'https://github.com/slince-zero/ai-agent-pro/blob/main/README.md',
        },
      ],
    },
  ])
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
    memoryService: createFakeMemoryService(),
    ragRetrievalService: createFakeRagRetrievalService(),
    summaryService: createFakeSummaryService(),
    citationService: createFakeCitationService(),
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

test('persists multi-agent workflow stages without changing the single-agent default', async () => {
  const runCreates: unknown[] = []
  const stageCreates: unknown[] = []
  const stageUpdates: unknown[] = []
  const fakeDb = {
    agentRun: {
      create: async (args: unknown) => {
        runCreates.push(args)
        return { id: 'run_multi' }
      },
      update: async () => ({ id: 'run_multi' }),
    },
    agentStage: {
      create: async (args: unknown) => {
        stageCreates.push(args)
        return { id: `stage_${stageCreates.length}` }
      },
      update: async (args: unknown) => {
        stageUpdates.push(args)
        return { id: `stage_${stageUpdates.length}` }
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
    calculateRunCost: () => 0.002,
    runMultiAgentWorkflowFn,
    sessionService: createFakeSessionService(),
    memoryService: createFakeMemoryService(),
    ragRetrievalService: createFakeRagRetrievalService(),
    summaryService: createFakeSummaryService(),
    citationService: createFakeCitationService(),
  })
  const events: ServerEvent[] = []

  const result = await service.sendMessage({
    content: 'Handle a complex task',
    modelClient: {} as ModelClient,
    session,
    signal: new AbortController().signal,
    workflow: 'multi_agent',
    onEvent: (event) => {
      events.push(event)
    },
  })

  assert.deepEqual(runCreates[0], {
    data: {
      sessionId: 'session_1',
      userMessageId: 'msg_user',
      model: 'test-model',
      workflow: AgentWorkflow.MULTI_AGENT,
    },
  })
  assert.deepEqual(
    stageCreates.map((item) => (item as { data: unknown }).data),
    [
      { runId: 'run_multi', sequence: 0, role: AgentStageRole.PLANNER },
      { runId: 'run_multi', sequence: 1, role: AgentStageRole.EXECUTOR },
      { runId: 'run_multi', sequence: 2, role: AgentStageRole.CRITIC },
    ],
  )
  assert.equal(stageUpdates.length, 3)
  assert.equal(
    (stageUpdates[2] as { data: { status: string } }).data.status,
    AgentStageStatus.COMPLETED,
  )
  assert.equal((stageUpdates[2] as { data: { output: string } }).data.output, 'Reviewed answer')
  assert.deepEqual(result, { inputTokens: 9, outputTokens: 12, cost: 0.002 })
  assert.deepEqual(events.slice(0, 2), [
    { type: 'run_id', runId: 'run_multi' },
    { type: 'text', text: 'Reviewed answer' },
  ])
})
