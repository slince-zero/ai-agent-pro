import type pino from 'pino'

import { prisma } from '../db/client.js'
import { Prisma, RunStatus, ToolCallStatus } from '../generated/prisma/client.js'
import type { ModelClient } from '../runtime/model-client/types.js'
import type { ServerEvent } from '../sse/events.js'
import { runAgent } from './agent.js'
import { MODEL } from './openai.js'
import { calculateCost } from './pricing.js'
import { type ActiveSession, createSessionService } from './session-service.js'

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

function toJsonValue(value: unknown) {
  return value === undefined ? Prisma.JsonNull : (value as Prisma.InputJsonValue)
}

export function createChatService({
  db = prisma as unknown as ChatServiceDb,
  model = MODEL,
  calculateRunCost = calculateCost,
  runAgentFn = runAgent,
  sessionService = createSessionService(),
}: ChatServiceDeps = {}) {
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
        const messages = await sessionService.getRecentClientMessages(session.id)
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
                    status: ToolCallStatus.COMPLETED,
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
                    status: ToolCallStatus.COMPLETED,
                    finishedAt: new Date(),
                  },
                })
              }

              await onEvent({
                type: 'tool_result',
                toolCallId: event.toolCallId,
                name: event.name,
                preview: event.preview,
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

      await sessionService.touchSession(session.id)

      return {
        inputTokens,
        outputTokens,
        cost: runCost,
      }
    },
  }
}
