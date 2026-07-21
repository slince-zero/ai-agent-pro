import { Router } from 'express'
import { z } from 'zod'

import type { ModelClient } from '../runtime/model-client/types.js'
import { createChatService } from '../services/chat-service.js'
import { createSessionService } from '../services/session-service.js'
import { createSseWriter, prepareSse, startSseHeartbeat } from '../sse/events.js'

type SessionsRouterDeps = {
  modelClient: ModelClient
  chatService?: ReturnType<typeof createChatService>
  sessionService?: ReturnType<typeof createSessionService>
}

const createSessionSchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
  })
  .strict()

const workflowSchema = z.enum(['single', 'multi_agent'])

const createMessageSchema = z
  .object({
    content: z.string().trim().min(1).max(30_000),
    workflow: workflowSchema.optional(),
  })
  .strict()

const regenerateMessageSchema = z
  .object({
    workflow: workflowSchema.optional(),
  })
  .strict()

const updateSessionSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
  })
  .strict()

export function createSessionsRouter({
  modelClient,
  sessionService = createSessionService(),
  chatService = createChatService({ sessionService }),
}: SessionsRouterDeps) {
  const router = Router()

  router.get('/', async (req, res) => {
    try {
      const sessions = await sessionService.listActiveSessions(req.auth.user.id)

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
      const session = await sessionService.createSession(req.auth.user.id, parsed.data.title)

      res.status(201).json({ session })
    } catch (error) {
      req.log.error({ err: error }, '创建会话失败')
      res.status(500).json({ error: '创建会话失败' })
    }
  })

  router.patch('/:sessionId', async (req, res) => {
    const parsed = updateSessionSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: '会话参数无效' })
    }

    try {
      const session = await sessionService.renameActiveSession(
        req.auth.user.id,
        req.params.sessionId,
        parsed.data.title,
      )

      if (!session) {
        return res.status(404).json({ error: '会话不存在' })
      }

      res.json({ session })
    } catch (error) {
      req.log.error({ err: error }, '重命名会话失败')
      res.status(500).json({ error: '重命名会话失败' })
    }
  })

  router.delete('/:sessionId', async (req, res) => {
    try {
      const session = await sessionService.archiveActiveSession(
        req.auth.user.id,
        req.params.sessionId,
      )

      if (!session) {
        return res.status(404).json({ error: '会话不存在' })
      }

      res.json({ session })
    } catch (error) {
      req.log.error({ err: error }, '删除会话失败')
      res.status(500).json({ error: '删除会话失败' })
    }
  })

  router.get('/:sessionId/messages', async (req, res) => {
    try {
      const messages = await sessionService.listSessionMessages(
        req.auth.user.id,
        req.params.sessionId,
      )

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

    const session = await sessionService.getActiveSession(req.auth.user.id, req.params.sessionId)

    if (!session) {
      return res.status(404).json({ error: '会话不存在' })
    }

    prepareSse(res)
    const sse = createSseWriter(res)
    const stopHeartbeat = startSseHeartbeat(res)

    const controller = new AbortController()
    res.on('close', () => {
      stopHeartbeat()
      controller.abort()
    })

    try {
      const { cost, inputTokens, outputTokens } = await chatService.sendMessage({
        content: parsed.data.content,
        modelClient,
        session,
        signal: controller.signal,
        logger: req.log,
        workflow: parsed.data.workflow,
        onEvent: async (event) => {
          if (!controller.signal.aborted && !res.writableEnded) {
            sse.write(event)
          }
        },
      })

      if (!controller.signal.aborted && !res.writableEnded) {
        sse.write({
          type: 'usage',
          inputTokens,
          outputTokens,
          cost,
        })
        sse.write({ type: 'done' })
        stopHeartbeat()
        res.end()
      }
    } catch (error) {
      if (controller.signal.aborted) return

      req.log.error({ err: error, sessionId: session.id }, '会话消息处理失败')

      if (!res.writableEnded) {
        sse.write({
          type: 'error',
          error: '请求处理失败，请查看 server 终端日志。',
        })
        stopHeartbeat()
        res.end()
      }
    }
  })

  router.post('/:sessionId/regenerate', async (req, res) => {
    const parsed = regenerateMessageSchema.safeParse(req.body ?? {})
    if (!parsed.success) {
      return res.status(400).json({ error: '重新生成参数无效' })
    }

    const session = await sessionService.getActiveSession(req.auth.user.id, req.params.sessionId)

    if (!session) {
      return res.status(404).json({ error: '会话不存在' })
    }

    const target = await sessionService.getLatestRegenerationTarget(req.auth.user.id, session.id)
    if (!target) {
      return res.status(409).json({ error: '没有可重新生成的回复' })
    }

    prepareSse(res)
    const sse = createSseWriter(res)
    const stopHeartbeat = startSseHeartbeat(res)

    const controller = new AbortController()
    res.on('close', () => {
      stopHeartbeat()
      controller.abort()
    })

    try {
      const result = await chatService.regenerateLastAssistant({
        modelClient,
        session,
        target,
        signal: controller.signal,
        logger: req.log,
        workflow: parsed.data.workflow,
        onEvent: async (event) => {
          if (!controller.signal.aborted && !res.writableEnded) {
            sse.write(event)
          }
        },
      })

      if (!result) {
        if (!res.writableEnded) {
          sse.write({
            type: 'error',
            error: '没有可重新生成的回复',
          })
          stopHeartbeat()
          res.end()
        }
        return
      }

      if (!controller.signal.aborted && !res.writableEnded) {
        sse.write({
          type: 'usage',
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          cost: result.cost,
        })
        sse.write({ type: 'done' })
        stopHeartbeat()
        res.end()
      }
    } catch (error) {
      if (controller.signal.aborted) return

      req.log.error({ err: error, sessionId: session.id }, '重新生成会话回复失败')

      if (!res.writableEnded) {
        sse.write({
          type: 'error',
          error: '重新生成失败，请查看 server 终端日志。',
        })
        stopHeartbeat()
        res.end()
      }
    }
  })

  return router
}
