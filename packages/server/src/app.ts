import { randomUUID } from 'node:crypto'
import path from 'node:path'

import cors from 'cors'
import express from 'express'
import { pinoHttp } from 'pino-http'

import { env } from './env.js'
import { logger } from './logger.js'
import { createRunsRouter } from './routes/runs.js'
import { createSessionsRouter } from './routes/sessions.js'
import { createOpenAIClient } from './services/openai.js'

export function createApp() {
  const app = express()
  const openai = createOpenAIClient()

  // ---- requestId & structured logging middleware ----
  app.use(
    pinoHttp({
      logger,

      genReqId(req: express.Request, res: express.Response) {
        const requestId =
          (req.headers['x-request-id'] as string | undefined)?.trim() || randomUUID()

        res.setHeader('x-request-id', requestId)

        return requestId
      },

      autoLogging: {
        ignore(req: express.Request) {
          return req.url !== undefined && req.url.startsWith('/api/health')
        },
      },
    }),
  )

  app.use(
    cors({
      origin: env.NODE_ENV !== 'production',
    }),
  )

  app.use(express.json())
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true })
  })

  app.use('/api/sessions', createSessionsRouter({ openai }))
  app.use('/api/runs', createRunsRouter())
  app.use(
    (err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
      req.log.error(
        {
          err,
        },
        'unhandled error',
      )

      res.status(500).json({
        error: 'Internal Server Error',
        requestId: req.id,
      })
    },
  )

  if (env.NODE_ENV === 'production') {
    const clientDistPath = env.CLIENT_DIST_DIR || path.join(process.cwd(), 'public')

    app.use(express.static(clientDistPath))
    app.get(/^\/(?!api(?:\/|$)).*/, (_req, res) => {
      res.sendFile(path.join(clientDistPath, 'index.html'))
    })
  }

  return app
}
