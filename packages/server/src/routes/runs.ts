import { Router } from 'express'

import { prisma } from '../db/client.js'
import type { AgentRun, Message, Session, ToolCall, User } from '../generated/prisma/client.js'
import { getCurrentUser } from '../services/users.js'

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
  getUser?: () => Promise<Pick<User, 'id'>>
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

type RunWithRelations = AgentRun & {
  session: Pick<Session, 'id' | 'title'>
  userMessage: MessageTrace | null
  assistantMessage: MessageTrace | null
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
    model: run.model,
    error: run.error,
    inputTokens: run.inputTokens,
    outputTokens: run.outputTokens,
    cost: run.cost,
    startedAt: run.startedAt.toISOString(),
    finishedAt: toIsoString(run.finishedAt),
    userMessage,
    assistantMessage,
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

export function createRunsRouter({
  db = prisma as unknown as RunsDb,
  getUser = getCurrentUser,
}: RunsRouterDeps = {}) {
  const router = Router()

  router.get('/', async (req, res) => {
    try {
      const user = await getUser()
      const limit = parseLimit(req.query.limit)
      const runs = await db.agentRun.findMany({
        where: {
          session: {
            userId: user.id,
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
      const user = await getUser()
      const run = await db.agentRun.findFirst({
        where: {
          id: req.params.runId,
          session: {
            userId: user.id,
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
