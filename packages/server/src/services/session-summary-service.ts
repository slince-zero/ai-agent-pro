import type pino from 'pino'

import { prisma } from '../db/client.js'
import { MessageRole } from '../generated/prisma/client.js'
import type { ModelClient, ModelMessage } from '../runtime/model-client/types.js'
import { parseModelStream } from '../runtime/stream-parser.js'

export const DEFAULT_SUMMARY_MIN_MESSAGES = 40
export const DEFAULT_SUMMARY_RETAIN_RECENT_MESSAGES = 12
export const DEFAULT_SUMMARY_MIN_NEW_MESSAGES = 10

const SUMMARY_SYSTEM_PROMPT =
  'You create compact session summaries for an AI coding agent. Preserve user goals, decisions, constraints, important facts, and unresolved next steps. Be concise and do not invent details.'

type SummaryMessageRecord = {
  id: string
  role: MessageRole
  content: string
  createdAt: Date
}

type SessionSummaryRecord = {
  id: string
  sessionId: string
  content: string
  coveredMessageCount: number
  coveredThroughMessageId: string | null
  createdAt: Date
  updatedAt: Date
}

type SessionSummaryServiceDb = {
  message: {
    count: (args: unknown) => Promise<number>
    findMany: (args: unknown) => Promise<SummaryMessageRecord[]>
  }
  sessionSummary: {
    findFirst: (args: unknown) => Promise<SessionSummaryRecord | null>
    create: (args: unknown) => Promise<SessionSummaryRecord>
  }
}

type SessionSummaryServiceDeps = {
  db?: SessionSummaryServiceDb
  options?: Partial<SessionSummaryOptions>
}

type SessionSummaryOptions = {
  minMessages: number
  retainRecentMessages: number
  minNewMessages: number
}

type MaybeRefreshInput = {
  sessionId: string
  modelClient: ModelClient
  signal: AbortSignal
  logger?: pino.Logger
}

type RefreshResult =
  | { created: true; summary: ReturnType<typeof serializeSessionSummary> }
  | { created: false; reason: 'below_threshold' | 'not_enough_new_messages' | 'no_messages' }

function normalizeOptions(options: Partial<SessionSummaryOptions> = {}): SessionSummaryOptions {
  return {
    minMessages: toPositiveInteger(options.minMessages, DEFAULT_SUMMARY_MIN_MESSAGES),
    retainRecentMessages: toPositiveInteger(
      options.retainRecentMessages,
      DEFAULT_SUMMARY_RETAIN_RECENT_MESSAGES,
    ),
    minNewMessages: toPositiveInteger(options.minNewMessages, DEFAULT_SUMMARY_MIN_NEW_MESSAGES),
  }
}

function toPositiveInteger(value: number | undefined, fallback: number) {
  if (!Number.isFinite(value) || value == null) return fallback

  const normalized = Math.floor(value)
  return normalized > 0 ? normalized : fallback
}

function toClientRole(role: MessageRole) {
  if (role === MessageRole.USER) return 'User'
  if (role === MessageRole.ASSISTANT) return 'Assistant'
  return role.toString()
}

function formatMessagesForSummary(messages: SummaryMessageRecord[]) {
  return messages
    .map((message, index) => `${index + 1}. ${toClientRole(message.role)}: ${message.content}`)
    .join('\n')
}

function buildSummaryMessages(
  messages: SummaryMessageRecord[],
  previousSummary: SessionSummaryRecord | null,
): ModelMessage[] {
  const previousSummaryBlock = previousSummary
    ? `Previous summary:\n${previousSummary.content}\n\n`
    : ''

  return [
    { role: 'system', content: SUMMARY_SYSTEM_PROMPT },
    {
      role: 'user',
      content: `${previousSummaryBlock}Messages to summarize:\n${formatMessagesForSummary(messages)}`,
    },
  ]
}

function normalizeSummaryContent(content: string) {
  const normalized = content.replace(/\s+/g, ' ').trim()
  if (!normalized) throw new Error('summary content is empty')
  return normalized
}

function serializeSessionSummary(summary: SessionSummaryRecord) {
  return {
    id: summary.id,
    sessionId: summary.sessionId,
    content: summary.content,
    coveredMessageCount: summary.coveredMessageCount,
    coveredThroughMessageId: summary.coveredThroughMessageId,
    createdAt: summary.createdAt.toISOString(),
    updatedAt: summary.updatedAt.toISOString(),
  }
}

export function createSessionSummaryService({
  db = prisma as unknown as SessionSummaryServiceDb,
  options = {},
}: SessionSummaryServiceDeps = {}) {
  const resolvedOptions = normalizeOptions(options)

  const getLatestSummary = (sessionId: string) =>
    db.sessionSummary.findFirst({
      where: {
        sessionId,
      },
      orderBy: [{ coveredMessageCount: 'desc' }, { createdAt: 'desc' }],
    })

  return {
    async getLatestSummary(sessionId: string) {
      const summary = await getLatestSummary(sessionId)
      return summary ? serializeSessionSummary(summary) : null
    },

    async getLatestSummaryContent(sessionId: string) {
      const summary = await getLatestSummary(sessionId)
      return summary?.content ?? null
    },

    async maybeRefreshSessionSummary({
      sessionId,
      modelClient,
      signal,
      logger,
    }: MaybeRefreshInput): Promise<RefreshResult> {
      const totalMessages = await db.message.count({
        where: {
          sessionId,
          role: {
            in: [MessageRole.USER, MessageRole.ASSISTANT],
          },
        },
      })

      if (totalMessages < resolvedOptions.minMessages) {
        return { created: false, reason: 'below_threshold' }
      }

      const coveredMessageCount = totalMessages - resolvedOptions.retainRecentMessages
      if (coveredMessageCount <= 0) {
        return { created: false, reason: 'no_messages' }
      }

      const previousSummary = await getLatestSummary(sessionId)
      const previousCoveredCount = previousSummary?.coveredMessageCount ?? 0
      if (coveredMessageCount - previousCoveredCount < resolvedOptions.minNewMessages) {
        return { created: false, reason: 'not_enough_new_messages' }
      }

      const messages = await db.message.findMany({
        where: {
          sessionId,
          role: {
            in: [MessageRole.USER, MessageRole.ASSISTANT],
          },
        },
        orderBy: {
          createdAt: 'asc',
        },
        take: coveredMessageCount,
      })

      if (messages.length === 0) {
        return { created: false, reason: 'no_messages' }
      }

      const stream = await modelClient.streamChat({
        messages: buildSummaryMessages(messages, previousSummary),
        tools: [],
        signal,
      })
      const result = await parseModelStream({
        stream,
        signal,
        onEvent: () => undefined,
      })
      const content = normalizeSummaryContent(result.text)
      const coveredThroughMessageId = messages.at(-1)?.id ?? null

      const summary = await db.sessionSummary.create({
        data: {
          sessionId,
          content,
          coveredMessageCount: messages.length,
          coveredThroughMessageId,
        },
      })

      logger?.info(
        { sessionId, coveredMessageCount: messages.length, summaryId: summary.id },
        '会话摘要已更新',
      )

      return { created: true, summary: serializeSessionSummary(summary) }
    },
  }
}

export type SessionSummaryService = ReturnType<typeof createSessionSummaryService>
