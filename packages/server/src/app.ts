import express from 'express'
import { askAgentStream } from './agent.js'
import { reportErrorLog } from './util.js'

export function createApp() {
  const app = express()

  app.use(express.json({ limit: '16kb' }))

  // app.post('/api/questions', async (request, response) => {
  //   const { messages } = request.body

  //   if (!Array.isArray(messages) || messages.length === 0) {
  //     response.status(400).json({
  //       error: 'messages must be a non-empty array',
  //     })
  //     return
  //   }
  //   try {
  //     const res = await askAgent(messages)

  //     response.json({
  //       message: res.message,
  //       usage: res.usage,
  //     })
  //   } catch (error: unknown) {
  //     reportErrorLog(error)
  //     response.status(502).json({
  //       error: '模型服务暂时不可用',
  //     })
  //   }
  // })

  app.post('/api/questions/stream', async (request, response) => {
    const { messages } = request.body

    if (!Array.isArray(messages) || messages.length === 0) {
      response.status(400).json({
        error: 'messages must be a non-empty array',
      })
      return
    }

    response.status(200)
    response.set({
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no', // Nginx 专用，避免缓冲导致流式失效
    })
    response.flushHeaders() // 立即发送给客户端

    try {
      for await (const event of askAgentStream(messages)) {
        response.write(`${JSON.stringify(event)}\n`)
      }
    } catch (error: unknown) {
      reportErrorLog(error)

      // 流已经开始后，不能再把 HTTP 状态改成 502。
      response.write(
        `${JSON.stringify({
          type: 'error',
          message: '模型服务暂时不可用',
        })}\n`,
      )
    } finally {
      response.end()
    }
  })

  return app
}
