import assert from 'node:assert/strict'
import type { Server } from 'node:http'
import { after, before, test } from 'node:test'

import express from 'express'

import {
  AgentStageRole,
  AgentStageStatus,
  AgentWorkflow,
  MessageRole,
  RunStatus,
  ToolCallStatus,
} from '../generated/prisma/client.js'

process.env.OPENAI_API_KEY = 'test-api-key'
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test'

type JsonObject = Record<string, unknown>

const startedAt = new Date('2026-06-17T06:00:00.000Z')
const finishedAt = new Date('2026-06-17T06:00:03.000Z')

const traceRun = {
  id: 'run_1',
  sessionId: 'session_1',
  userMessageId: 'msg_user',
  assistantMessageId: 'msg_assistant',
  workflow: AgentWorkflow.MULTI_AGENT,
  status: RunStatus.COMPLETED,
  model: 'deepseek-chat',
  error: null,
  inputTokens: 100,
  outputTokens: 50,
  cost: 0.000123,
  startedAt,
  finishedAt,
  session: {
    id: 'session_1',
    title: 'Trace session',
  },
  userMessage: {
    id: 'msg_user',
    role: MessageRole.USER,
    content: 'Explain the trace',
    createdAt: new Date('2026-06-17T05:59:59.000Z'),
  },
  assistantMessage: {
    id: 'msg_assistant',
    role: MessageRole.ASSISTANT,
    content: 'Here is a trace summary.',
    createdAt: finishedAt,
  },
  stages: [
    {
      id: 'stage_1',
      runId: 'run_1',
      sequence: 0,
      role: AgentStageRole.PLANNER,
      status: AgentStageStatus.COMPLETED,
      output: 'Inspect the trace, then answer.',
      error: null,
      inputTokens: 20,
      outputTokens: 10,
      startedAt,
      finishedAt: new Date('2026-06-17T06:00:01.000Z'),
    },
  ],
  toolCalls: [
    {
      id: 'tool_1',
      runId: 'run_1',
      toolCallId: 'call_1',
      name: 'web_fetch',
      arguments: {
        url: 'https://example.com/docs',
        long: 'x'.repeat(700),
      },
      result: 'result '.repeat(500),
      status: ToolCallStatus.COMPLETED,
      error: null,
      durationMs: 1234,
      startedAt: new Date('2026-06-17T06:00:01.000Z'),
      finishedAt: new Date('2026-06-17T06:00:02.000Z'),
    },
  ],
}

function createFakeDb() {
  return {
    agentRun: {
      findMany: async () => [traceRun],
      findFirst: async (args: unknown) => {
        const runId = (args as { where?: { id?: string } }).where?.id
        return runId === traceRun.id ? traceRun : null
      },
    },
  }
}

let server: Server
let baseUrl: string

before(async () => {
  const { createRunsRouter } = await import('./runs.js')
  const app = express()

  app.use(
    '/api/runs',
    createRunsRouter({
      db: createFakeDb(),
      getUser: async () => ({ id: 'user_1' }),
    }),
  )

  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve())
  })

  const address = server.address()
  assert.ok(address && typeof address === 'object')
  baseUrl = `http://127.0.0.1:${address.port}`
})

after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
  })
})

test('lists recent runs with summaries and preview-only tool calls', async () => {
  const response = await fetch(`${baseUrl}/api/runs`)
  const body = (await response.json()) as { runs: JsonObject[] }

  assert.equal(response.status, 200)
  assert.equal(body.runs.length, 1)

  const run = body.runs[0] as {
    id: string
    status: string
    workflow: string
    session: { title: string }
    userMessage: { content: string }
    assistantMessage: { content: string }
    toolCalls: JsonObject[]
    stages: JsonObject[]
  }

  assert.equal(run.id, 'run_1')
  assert.equal(run.status, 'completed')
  assert.equal(run.workflow, 'multi_agent')
  assert.equal(run.session.title, 'Trace session')
  assert.equal(run.userMessage.content, 'Explain the trace')
  assert.equal(run.assistantMessage.content, 'Here is a trace summary.')
  assert.equal(run.toolCalls.length, 1)
  assert.equal(run.stages.length, 1)
  assert.equal('output' in run.stages[0]!, false)
  assert.equal('resultPreview' in run.toolCalls[0]!, false)
  assert.equal((run.toolCalls[0] as { durationMs?: number }).durationMs, 1234)
})

test('returns run detail with messages, usage and truncated tool result', async () => {
  const response = await fetch(`${baseUrl}/api/runs/run_1`)
  const body = (await response.json()) as { run: JsonObject }
  const run = body.run as {
    inputTokens: number
    outputTokens: number
    cost: number
    workflow: string
    stages: { role: string; status: string; output: string }[]
    toolCalls: {
      arguments: { long: string }
      resultPreview: string
      durationMs: number
    }[]
  }

  assert.equal(response.status, 200)
  assert.equal(run.inputTokens, 100)
  assert.equal(run.outputTokens, 50)
  assert.equal(run.cost, 0.000123)
  assert.equal(run.workflow, 'multi_agent')
  assert.deepEqual(run.stages[0], {
    id: 'stage_1',
    sequence: 0,
    role: 'planner',
    status: 'completed',
    output: 'Inspect the trace, then answer.',
    error: null,
    inputTokens: 20,
    outputTokens: 10,
    startedAt: startedAt.toISOString(),
    finishedAt: '2026-06-17T06:00:01.000Z',
  })
  assert.equal(run.toolCalls[0]?.arguments.long.length, 503)
  assert.equal(run.toolCalls[0]?.durationMs, 1234)
  assert.equal(run.toolCalls[0]?.resultPreview.endsWith('...'), true)
})

test('returns 404 for missing runs', async () => {
  const response = await fetch(`${baseUrl}/api/runs/missing`)
  const body = (await response.json()) as { error: string }

  assert.equal(response.status, 404)
  assert.equal(body.error, '运行记录不存在')
})
