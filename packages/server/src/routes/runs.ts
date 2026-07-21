import { Router } from 'express'

import { prisma } from '../db/client.js'
import type {
  AgentRun,
  AgentStage,
  Message,
  Session,
  ToolCall,
} from '../generated/prisma/client.js'

const DEFAULT_RUN_LIMIT = 30
const MAX_RUN_LIMIT = 100
const MESSAGE_PREVIEW_CHARS = 180
const TOOL_RESULT_PREVIEW_CHARS = 2_000
const JSON_STRING_PREVIEW_CHARS = 500

type RunsDb = {
  agentRun: {
    findMany: (args: unknown) => Promise<RunWithRelations[]>
    findFirst: (args: unknown) => Promise<RunWithRelations | null>
  }
}

type RunsRouterDeps = {
  db?: RunsDb
}

type MessageTrace = Pick<Message, 'id' | 'role' | 'content' | 'createdAt'>

type ToolCallTrace = Pick<
  ToolCall,
  | 'id'
  | 'toolCallId'
  | 'name'
  | 'arguments'
  | 'result'
  | 'status'
  | 'error'
  | 'durationMs'
  | 'startedAt'
  | 'finishedAt'
>

type AgentStageTrace = Pick<
  AgentStage,
  | 'id'
  | 'sequence'
  | 'role'
  | 'status'
  | 'error'
  | 'inputTokens'
  | 'outputTokens'
  | 'startedAt'
  | 'finishedAt'
> & {
  output?: string | null
}

type RunWithRelations = AgentRun & {
  session: Pick<Session, 'id' | 'title'>
  userMessage: MessageTrace | null
  assistantMessage: MessageTrace | null
  stages: AgentStageTrace[]
  toolCalls: ToolCallTrace[]
}

function parseLimit(value: unknown) {
  const rawValue = Array.isArray(value) ? value[0] : value
  const parsed = Number(rawValue ?? DEFAULT_RUN_LIMIT)

  if (!Number.isInteger(parsed) || parsed <= 0) return DEFAULT_RUN_LIMIT
  return Math.min(parsed, MAX_RUN_LIMIT)
}

function toLowerStatus(status: { toString: () => string }) {
  return status.toString().toLowerCase()
}

function toIsoString(value: Date | null) {
  return value ? value.toISOString() : null
}

function truncateText(value: string | null, maxChars: number) {
  if (!value) return null
  return value.length > maxChars ? `${value.slice(0, maxChars)}...` : value
}

function sanitizeJson(value: unknown, depth = 0): unknown {
  if (value == null) return value

  if (typeof value === 'string') {
    return truncateText(value, JSON_STRING_PREVIEW_CHARS)
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value
  }

  if (depth >= 4) return '[truncated]'

  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => sanitizeJson(item, depth + 1))
  }

  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 30)
        .map(([key, item]) => [key, sanitizeJson(item, depth + 1)]),
    )
  }

  return String(value)
}

function serializeMessage(message: MessageTrace | null) {
  if (!message) return null

  return {
    id: message.id,
    role: message.role.toString().toLowerCase(),
    content: message.content,
    preview: truncateText(message.content, MESSAGE_PREVIEW_CHARS),
    createdAt: message.createdAt.toISOString(),
  }
}

function serializeToolCall(toolCall: ToolCallTrace) {
  return {
    id: toolCall.id,
    toolCallId: toolCall.toolCallId,
    name: toolCall.name,
    arguments: sanitizeJson(toolCall.arguments),
    resultPreview: truncateText(toolCall.result, TOOL_RESULT_PREVIEW_CHARS),
    status: toLowerStatus(toolCall.status),
    error: toolCall.error,
    durationMs: toolCall.durationMs,
    startedAt: toolCall.startedAt.toISOString(),
    finishedAt: toIsoString(toolCall.finishedAt),
  }
}

function serializeStage(stage: AgentStageTrace) {
  return {
    id: stage.id,
    sequence: stage.sequence,
    role: toLowerStatus(stage.role),
    status: toLowerStatus(stage.status),
    output: stage.output ?? null,
    error: stage.error,
    inputTokens: stage.inputTokens,
    outputTokens: stage.outputTokens,
    startedAt: stage.startedAt.toISOString(),
    finishedAt: toIsoString(stage.finishedAt),
  }
}

function serializeRun(run: RunWithRelations) {
  const userMessage = serializeMessage(run.userMessage)
  const assistantMessage = serializeMessage(run.assistantMessage)

  return {
    id: run.id,
    session: {
      id: run.session.id,
      title: run.session.title,
    },
    status: toLowerStatus(run.status),
    workflow: toLowerStatus(run.workflow),
    model: run.model,
    error: run.error,
    inputTokens: run.inputTokens,
    outputTokens: run.outputTokens,
    cost: run.cost,
    startedAt: run.startedAt.toISOString(),
    finishedAt: toIsoString(run.finishedAt),
    userMessage,
    assistantMessage,
    stages: run.stages.map(serializeStage),
    toolCalls: run.toolCalls.map(serializeToolCall),
  }
}

function serializeRunSummary(run: RunWithRelations) {
  const serialized = serializeRun(run)

  return {
    ...serialized,
    userMessage: serialized.userMessage
      ? {
          ...serialized.userMessage,
          content: serialized.userMessage.preview,
        }
      : null,
    assistantMessage: serialized.assistantMessage
      ? {
          ...serialized.assistantMessage,
          content: serialized.assistantMessage.preview,
        }
      : null,
    stages: serialized.stages.map(({ output: _output, ...stage }) => stage),
    toolCalls: serialized.toolCalls.map((toolCall) => ({
      id: toolCall.id,
      toolCallId: toolCall.toolCallId,
      name: toolCall.name,
      status: toolCall.status,
      error: toolCall.error,
      durationMs: toolCall.durationMs,
      startedAt: toolCall.startedAt,
      finishedAt: toolCall.finishedAt,
    })),
  }
}

export function createRunsRouter({ db = prisma as unknown as RunsDb }: RunsRouterDeps = {}) {
  const router = Router()

  router.get('/', async (req, res) => {
    try {
      const limit = parseLimit(req.query.limit)
      const runs = await db.agentRun.findMany({
        where: {
          session: {
            userId: req.auth.user.id,
          },
        },
        orderBy: {
          startedAt: 'desc',
        },
        take: limit,
        include: {
          session: {
            select: {
              id: true,
              title: true,
            },
          },
          userMessage: true,
          assistantMessage: true,
          stages: {
            orderBy: {
              sequence: 'asc',
            },
            select: {
              id: true,
              sequence: true,
              role: true,
              status: true,
              error: true,
              inputTokens: true,
              outputTokens: true,
              startedAt: true,
              finishedAt: true,
            },
          },
          toolCalls: {
            orderBy: {
              startedAt: 'asc',
            },
          },
        },
      })

      res.json({ runs: runs.map(serializeRunSummary) })
    } catch (error) {
      req.log.error({ err: error }, '获取运行记录失败')
      res.status(500).json({ error: '获取运行记录失败' })
    }
  })

  router.get('/:runId', async (req, res) => {
    try {
      const run = await db.agentRun.findFirst({
        where: {
          id: req.params.runId,
          session: {
            userId: req.auth.user.id,
          },
        },
        include: {
          session: {
            select: {
              id: true,
              title: true,
            },
          },
          userMessage: true,
          assistantMessage: true,
          stages: {
            orderBy: {
              sequence: 'asc',
            },
          },
          toolCalls: {
            orderBy: {
              startedAt: 'asc',
            },
          },
        },
      })

      if (!run) {
        return res.status(404).json({ error: '运行记录不存在' })
      }

      res.json({ run: serializeRun(run) })
    } catch (error) {
      req.log.error({ err: error }, '获取运行详情失败')
      res.status(500).json({ error: '获取运行详情失败' })
    }
  })

  return router
}
