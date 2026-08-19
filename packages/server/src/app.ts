import express from 'express'
import { askAgent } from './agent.js'

export function createApp() {
  const app = express()

  app.use(express.json({ limit: '16kb' }))

  app.post('/api/questions', async (request, response) => {
    const { question } = request.body

    if (typeof question !== 'string' || !question.trim()) {
      response.status(400).json({
        error: 'question must be non-empty string',
      })
      return
    }
    try {
      const res = await askAgent(question.trim())

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
