import type pino from 'pino'

import { prisma } from '../db/client.js'
import { Prisma, RunStatus, ToolCallStatus } from '../generated/prisma/client.js'
import { type ContextBuilder, createContextBuilder } from '../runtime/context-builder.js'
import type { ModelClient } from '../runtime/model-client/types.js'
import type { ServerEvent } from '../sse/events.js'
import { runAgent } from './agent.js'
import { type MemoryService, createMemoryService } from './memory-service.js'
import { MODEL } from './openai.js'
import { calculateCost } from './pricing.js'
import { type ActiveSession, createSessionService } from './session-service.js'
import {
  type SessionSummaryService,
  createSessionSummaryService,
} from './session-summary-service.js'

type AgentRunRecord = {
  id: string
}

type ToolCallRecord = {
  id: string
}

type ChatServiceDb = {
  agentRun: {
    create: (args: unknown) => Promise<AgentRunRecord>
    update: (args: unknown) => Promise<AgentRunRecord>
  }
  toolCall: {
    create: (args: unknown) => Promise<ToolCallRecord>
    update: (args: unknown) => Promise<ToolCallRecord>
  }
}

type ChatClientEvent = Exclude<ServerEvent, { type: 'usage' } | { type: 'done' }>

type RunAgentFn = typeof runAgent

type SessionService = ReturnType<typeof createSessionService>

type ChatServiceDeps = {
  db?: ChatServiceDb
  model?: string
  calculateRunCost?: typeof calculateCost
  runAgentFn?: RunAgentFn
  sessionService?: SessionService
  contextBuilder?: ContextBuilder
  memoryService?: MemoryService
  summaryService?: SessionSummaryService
}

type SendMessageInput = {
  content: string
  modelClient: ModelClient
  session: ActiveSession
  signal: AbortSignal
  logger?: pino.Logger
  onEvent: (event: ChatClientEvent) => void | Promise<void>
}

type SendMessageResult = {
  inputTokens: number
  outputTokens: number
  cost: number
}

function toToolCallStatus(status: 'completed' | 'failed' | undefined) {
  return status === 'failed' ? ToolCallStatus.FAILED : ToolCallStatus.COMPLETED
}

function toJsonValue(value: unknown) {
  return value === undefined ? Prisma.JsonNull : (value as Prisma.InputJsonValue)
}

export function createChatService({
  db = prisma as unknown as ChatServiceDb,
  model = MODEL,
  calculateRunCost = calculateCost,
  runAgentFn = runAgent,
  sessionService = createSessionService(),
  memoryService = createMemoryService(),
  summaryService = createSessionSummaryService(),
  contextBuilder,
}: ChatServiceDeps = {}) {
  const resolvedContextBuilder =
    contextBuilder ??
    createContextBuilder({
      source: {
        loadRecentMessages: (sessionId, take) =>
          sessionService.getRecentClientMessages(sessionId, take),
        loadSessionSummary: ({ sessionId }) => summaryService.getLatestSummaryContent(sessionId),
        loadRelevantMemories: async ({ sessionId, userId, projectId }) => {
          if (!userId) return []

          const memories = await memoryService.listContextMemories({
            userId,
            sessionId,
            projectId,
          })

          return memories.map((memory) => memory.content)
        },
      },
    })

  return {
    async sendMessage({
      content,
      modelClient,
      session,
      signal,
      logger,
      onEvent,
    }: SendMessageInput): Promise<SendMessageResult> {
      const userMessage = await sessionService.createUserMessage(session.id, content)
      await sessionService.updateTitleFromMessageIfNeeded(session, content)

      const run = await db.agentRun.create({
        data: {
          sessionId: session.id,
          userMessageId: userMessage.id,
          model,
        },
      })

      await onEvent({ type: 'run_id', runId: run.id })

      const runLogger = logger?.child({ sessionId: session.id, runId: run.id })
      const toolCallIds = new Map<string, string>()
      let assistantText = ''
      let runError: string | null = null
      let inputTokens = 0
      let outputTokens = 0

      try {
        const messages = await resolvedContextBuilder.buildClientMessages({
          sessionId: session.id,
          userId: session.userId,
        })
        const usage = await runAgentFn({
          modelClient,
          messages,
          signal,
          logger: runLogger,
          onEvent: async (event) => {
            if (event.type === 'text') {
              assistantText += event.text
              await onEvent(event)
              return
            }

            if (event.type === 'tool_call') {
              const toolCall = await db.toolCall.create({
                data: {
                  runId: run.id,
                  toolCallId: event.toolCallId,
                  name: event.name,
                  arguments: toJsonValue(event.args),
                },
              })
              toolCallIds.set(event.toolCallId, toolCall.id)
              await onEvent(event)
              return
            }

            if (event.type === 'tool_result') {
              const id = toolCallIds.get(event.toolCallId)
              if (id) {
                await db.toolCall.update({
                  where: {
                    id,
                  },
                  data: {
                    result: event.result,
                    status: toToolCallStatus(event.status),
                    error: event.error ?? null,
                    durationMs: event.durationMs,
                    finishedAt: new Date(),
                  },
                })
              } else {
                await db.toolCall.create({
                  data: {
                    runId: run.id,
                    toolCallId: event.toolCallId,
                    name: event.name,
                    result: event.result,
                    status: toToolCallStatus(event.status),
                    error: event.error ?? null,
                    durationMs: event.durationMs,
                    finishedAt: new Date(),
                  },
                })
              }

              await onEvent({
                type: 'tool_result',
                toolCallId: event.toolCallId,
                name: event.name,
                preview: event.preview,
                status: event.status,
                durationMs: event.durationMs,
                error: event.error,
              })
              return
            }

            runError = event.error
            await onEvent(event)
          },
        })

        inputTokens = usage.inputTokens
        outputTokens = usage.outputTokens
      } catch (error) {
        await db.agentRun.update({
          where: {
            id: run.id,
          },
          data: {
            status: signal.aborted ? RunStatus.CANCELED : RunStatus.FAILED,
            error: signal.aborted ? null : (error as Error).message,
            finishedAt: new Date(),
          },
        })

        if (signal.aborted) {
          return {
            inputTokens,
            outputTokens,
            cost: calculateRunCost(model, inputTokens, outputTokens),
          }
        }

        throw error
      }

      const runCost = calculateRunCost(model, inputTokens, outputTokens)
      const assistantMessage = assistantText.trim()
        ? await sessionService.createAssistantMessage(session.id, assistantText)
        : null

      await db.agentRun.update({
        where: {
          id: run.id,
        },
        data: {
          assistantMessageId: assistantMessage?.id,
          status: signal.aborted
            ? RunStatus.CANCELED
            : runError
              ? RunStatus.FAILED
              : RunStatus.COMPLETED,
          error: runError,
          inputTokens,
          outputTokens,
          cost: runCost,
          finishedAt: new Date(),
        },
      })

      if (!signal.aborted && !runError) {
        try {
          await summaryService.maybeRefreshSessionSummary({
            sessionId: session.id,
            modelClient,
            signal,
            logger: runLogger,
          })
        } catch (error) {
          runLogger?.warn({ err: error }, '会话摘要刷新失败')
        }
      }

      await sessionService.touchSession(session.id)

      return {
        inputTokens,
        outputTokens,
        cost: runCost,
      }
    },
  }
}
