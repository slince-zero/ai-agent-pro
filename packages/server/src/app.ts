import express from 'express'
import type { ChatMessage, MessageStreamEvent } from '@ai-agent-pro/shared/type.js'
import { askAgentStream } from './agent.js'
import { resolveRetrievalTask } from './retrieval/resolve-retrieval-task.js'
import { reportErrorLog } from './util.js'

/**
 * 客户端只能提交对话双方的发言。system prompt 归服务端所有——
 * 一旦接受客户端的 system 消息，行为约束就成了可以从外部改写的东西。
 */
type ClientMessageRole = Exclude<ChatMessage['role'], 'system'>

function isClientMessageRole(value: unknown): value is ClientMessageRole {
  return value === 'user' || value === 'assistant'
}

function parseChatMessages(value: unknown): ChatMessage[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined

  const messages: ChatMessage[] = []

  for (const item of value) {
    if (typeof item !== 'object' || item === null) return undefined

    const message = item as Record<string, unknown>
    if (!isClientMessageRole(message.role) || typeof message.content !== 'string') return undefined

    messages.push({ role: message.role, content: message.content })
  }

  return messages
}

export function createApp() {
  const app = express()

  app.use(express.json({ limit: '16kb' }))

  app.post('/api/questions/stream', async (request, response) => {
    const messages = parseChatMessages(request.body?.messages)

    if (!messages) {
      response.status(400).json({
        error: 'messages must be a non-empty array',
      })
      return
    }

    const controller = new AbortController()
    response.once('close', () => {
      if (!response.writableEnded) {
        controller.abort()
      }
    })

    response.status(200)
    response.set({
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no', // Nginx 专用，避免缓冲导致流式失效
    })
    response.flushHeaders() // 立即发送给客户端

    const writeEvent = (event: MessageStreamEvent) => {
      response.write(`${JSON.stringify(event)}\n`)
    }

    try {
      /*
       * 每轮从请求里的完整对话重建当前任务。只接收双方发言，不接收客户端伪造的
       * 意图或证据；取消、重试和新对话都不需要维护服务端会话状态。
       */
      for await (const event of askAgentStream(
        messages,
        { signal: controller.signal },
        { resolveTask: (history, signal) => resolveRetrievalTask(history, signal) },
      )) {
        if (controller.signal.aborted) {
          return
        }
        writeEvent(event)
      }
    } catch (error: unknown) {
      if (controller.signal.aborted) {
        return
      }
      reportErrorLog(error)

      // 流已经开始后，不能再把 HTTP 状态改成 502。
      writeEvent({
        type: 'error',
        message:
          error instanceof Error && error.message === 'Retrieval answer failed evidence validation'
            ? '回答的来源核对未通过，请重试。'
            : '暂时无法完成回答，请重试。',
      })
    } finally {
      if (!response.writableEnded && !response.destroyed) {
        response.end()
      }
    }
  })

  return app
}
