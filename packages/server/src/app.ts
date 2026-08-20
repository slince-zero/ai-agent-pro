import express from 'express'
import { askAgent } from './agent.js'

export function createApp() {
  const app = express()

  app.use(express.json({ limit: '16kb' }))

  app.post('/api/questions', async (request, response) => {
    const { messages } = request.body

    if (!Array.isArray(messages) || messages.length === 0) {
      response.status(400).json({
        error: 'messages must be a non-empty array',
      })
      return
    }
    try {
      const res = await askAgent(messages)

      response.json({
        message: res.message,
        usage: res.usage,
      })
    } catch (error) {
      response.status(502).json({
        error: '模型服务暂时不可用',
      })
    }
  })

  return app
}
