import express from 'express'
import type { ChatMessage, MessageStreamEvent } from '@ai-agent-pro/shared/type.js'
import { askAgentStream } from './agent.js'
import { extractRetrievalIntent } from './retrieval/extract-retrieval-intent.js'
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
       * 意图解析在这里接上，而不是在循环里给默认值：它是一次额外的模型请求，
       * 组装点决定用不用它，循环本身没有它也能跑，测试也就不必先把网络挡掉。
       */
      for await (const event of askAgentStream(
        messages,
        { signal: controller.signal },
        // 包一层：extractRetrievalIntent 末尾还留着一个可注入的模型参数，这里只要前两个
        { extractIntent: (input, signal) => extractRetrievalIntent(input, signal) },
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
        message: '模型服务暂时不可用',
      })
    } finally {
      if (!response.writableEnded && !response.destroyed) {
        response.end()
      }
    }
  })

  return app
}
