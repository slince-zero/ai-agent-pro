import { Router } from 'express'
import type OpenAI from 'openai'
import { z } from 'zod'

import { createChatService } from '../services/chat-service.js'
import { createSessionService } from '../services/session-service.js'
import { getCurrentUser } from '../services/users.js'
import { prepareSse, writeSse } from '../sse/events.js'

type SessionsRouterDeps = {
  openai: OpenAI
  chatService?: ReturnType<typeof createChatService>
  sessionService?: ReturnType<typeof createSessionService>
}

const createSessionSchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
  })
  .strict()

const createMessageSchema = z
  .object({
    content: z.string().trim().min(1).max(30_000),
  })
  .strict()

export function createSessionsRouter({
  openai,
  sessionService = createSessionService(),
  chatService = createChatService({ sessionService }),
}: SessionsRouterDeps) {
  const router = Router()

  router.get('/', async (req, res) => {
    try {
      const user = await getCurrentUser()
      const sessions = await sessionService.listActiveSessions(user.id)

      res.json({ sessions })
    } catch (error) {
      req.log.error({ err: error }, '获取会话列表失败')
      res.status(500).json({ error: '获取会话列表失败' })
    }
  })

  router.post('/', async (req, res) => {
    const parsed = createSessionSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: '会话参数无效' })
    }

    try {
      const user = await getCurrentUser()
      const session = await sessionService.createSession(user.id, parsed.data.title)

      res.status(201).json({ session })
    } catch (error) {
      req.log.error({ err: error }, '创建会话失败')
      res.status(500).json({ error: '创建会话失败' })
    }
  })

  router.get('/:sessionId/messages', async (req, res) => {
    try {
      const user = await getCurrentUser()
      const messages = await sessionService.listSessionMessages(user.id, req.params.sessionId)

      if (!messages) {
        return res.status(404).json({ error: '会话不存在' })
      }

      res.json({ messages })
    } catch (error) {
      req.log.error({ err: error }, '获取消息失败')
      res.status(500).json({ error: '获取消息失败' })
    }
  })

  router.post('/:sessionId/messages', async (req, res) => {
    const parsed = createMessageSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: '消息内容无效' })
    }

    const user = await getCurrentUser()
    const session = await sessionService.getActiveSession(user.id, req.params.sessionId)

    if (!session) {
      return res.status(404).json({ error: '会话不存在' })
    }

    prepareSse(res)

    const controller = new AbortController()
    res.on('close', () => {
      controller.abort()
    })

    try {
      const { cost, inputTokens, outputTokens } = await chatService.sendMessage({
        content: parsed.data.content,
        openai,
        session,
        signal: controller.signal,
        logger: req.log,
        onEvent: async (event) => {
          if (!controller.signal.aborted && !res.writableEnded) {
            writeSse(res, event)
          }
        },
      })

      if (!controller.signal.aborted && !res.writableEnded) {
        writeSse(res, {
          type: 'usage',
          inputTokens,
          outputTokens,
          cost,
        })
        writeSse(res, { type: 'done' })
        res.end()
      }
    } catch (error) {
      if (controller.signal.aborted) return

      req.log.error({ err: error, sessionId: session.id }, '会话消息处理失败')

      if (!res.writableEnded) {
        writeSse(res, {
          type: 'error',
          error: '请求处理失败，请查看 server 终端日志。',
        })
        res.end()
      }
    }
  })

  return router
}
