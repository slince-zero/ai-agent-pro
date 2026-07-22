import { randomUUID } from 'node:crypto'
import path from 'node:path'

import { toNodeHandler } from 'better-auth/node'
import cors from 'cors'
import express from 'express'
import { pinoHttp } from 'pino-http'

import { auth } from './auth.js'
import { env } from './env.js'
import { logger } from './logger.js'
import { apiErrorHandler, sendApiError } from './middleware/api-error.js'
import { requireAuth } from './middleware/auth.js'
import {
  createBodyTypeGuard,
  createCorsOptions,
  createOriginGuard,
  createRequestBounds,
  createSecurityHeaders,
  parseTrustProxy,
  resolveAllowedOrigins,
} from './middleware/http-security.js'
import {
  createAuthenticatedRateLimiter,
  createRateLimiter,
  createRunConcurrencyLimit,
} from './middleware/rate-limits.js'
import { createRunsRouter } from './routes/runs.js'
import { createSessionsRouter } from './routes/sessions.js'
import { redactUrl } from './security/redaction.js'
import { createDefaultModelClient } from './services/openai.js'

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/

function requestIdFromHeader(value: string | string[] | undefined) {
  const candidate = Array.isArray(value) ? value[0] : value
  const trimmed = candidate?.trim()
  return trimmed && REQUEST_ID_PATTERN.test(trimmed) ? trimmed : randomUUID()
}

export function createApp() {
  const app = express()
  const modelClient = createDefaultModelClient()
  const production = env.NODE_ENV === 'production'
  const allowedOrigins = resolveAllowedOrigins([
    env.BETTER_AUTH_URL ?? `http://localhost:${env.PORT}`,
    env.AUTH_APP_URL ?? (production ? undefined : 'http://localhost:5173'),
    env.AUTH_TRUSTED_ORIGINS,
  ])

  app.set('trust proxy', parseTrustProxy(env.TRUST_PROXY))
  app.disable('x-powered-by')
  app.use(createSecurityHeaders({ production }))

  app.use(
    pinoHttp({
      logger,
      genReqId(req, res) {
        const requestId = requestIdFromHeader(req.headers['x-request-id'])
        res.setHeader('x-request-id', requestId)
        return requestId
      },
      serializers: {
        req(request) {
          return {
            id: request.id,
            method: request.method,
            url: redactUrl(request.url),
            remoteAddress: request.remoteAddress,
            remotePort: request.remotePort,
          }
        },
      },
      autoLogging: {
        ignore(req) {
          return req.url !== undefined && req.url.startsWith('/api/health')
        },
      },
    }),
  )

  const securityOptions = {
    allowedOrigins,
    maxBodyBytes: env.API_MAX_BODY_BYTES,
    maxUrlChars: env.API_MAX_URL_CHARS,
    production,
  }
  app.use('/api', createRequestBounds(securityOptions))
  app.use('/api', createOriginGuard(securityOptions))
  app.use('/api', cors(createCorsOptions(allowedOrigins)))

  const rateLimitWindowMs = env.API_RATE_LIMIT_WINDOW_MS
  app.use(
    '/api/auth',
    createRateLimiter({ windowMs: rateLimitWindowMs, max: env.AUTH_RATE_LIMIT_MAX }),
  )
  app.use(
    '/api/auth',
    createBodyTypeGuard(['application/json', 'application/x-www-form-urlencoded']),
    express.json({ limit: env.API_MAX_BODY_BYTES, strict: true }),
    express.urlencoded({ limit: env.API_MAX_BODY_BYTES, extended: false, parameterLimit: 100 }),
  )
  app.all('/api/auth/*splat', toNodeHandler(auth))

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true })
  })

  app.use('/api', createRateLimiter({ windowMs: rateLimitWindowMs, max: env.API_RATE_LIMIT_MAX }))
  app.use('/api', requireAuth)
  app.use('/api', express.json({ limit: env.API_MAX_BODY_BYTES, strict: true }))

  const runRateLimiter = createAuthenticatedRateLimiter({
    windowMs: rateLimitWindowMs,
    max: env.RUN_RATE_LIMIT_MAX,
  })
  const runConcurrencyLimit = createRunConcurrencyLimit(env.RUN_CONCURRENCY_MAX)
  app.post('/api/sessions/:sessionId/messages', runRateLimiter, runConcurrencyLimit)
  app.post('/api/sessions/:sessionId/regenerate', runRateLimiter, runConcurrencyLimit)

  app.use('/api/sessions', createSessionsRouter({ modelClient }))
  app.use('/api/runs', createRunsRouter())
  app.use('/api', (req, res) => {
    sendApiError(req, res, 404, 'NOT_FOUND', 'API route not found')
  })

  if (production) {
    const clientDistPath = env.CLIENT_DIST_DIR || path.join(process.cwd(), 'public')

    app.use(express.static(clientDistPath))
    app.get(/^\/(?!api(?:\/|$)).*/, (_req, res) => {
      res.sendFile(path.join(clientDistPath, 'index.html'))
    })
  }

  app.use(apiErrorHandler)
  return app
}
