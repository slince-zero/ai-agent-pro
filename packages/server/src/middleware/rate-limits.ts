import type { Request, RequestHandler } from 'express'
import { rateLimit } from 'express-rate-limit'

import { sendApiError } from './api-error.js'

type RateLimitOptions = {
  max: number
  windowMs: number
  keyGenerator?: (request: Request) => string
}

export function createRateLimiter({
  max,
  windowMs,
  keyGenerator,
}: RateLimitOptions): RequestHandler {
  return rateLimit({
    windowMs,
    limit: max,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator,
    handler(req, res) {
      sendApiError(req, res, 429, 'RATE_LIMITED', 'Too many requests')
    },
  })
}

export function createAuthenticatedRateLimiter(options: Omit<RateLimitOptions, 'keyGenerator'>) {
  return createRateLimiter({
    ...options,
    keyGenerator: (request) => request.auth.user.id,
  })
}

export function createRunConcurrencyLimit(maxConcurrent: number): RequestHandler {
  const activeByUser = new Map<string, number>()

  return (req, res, next) => {
    const userId = req.auth.user.id
    const active = activeByUser.get(userId) ?? 0

    if (active >= maxConcurrent) {
      sendApiError(
        req,
        res,
        429,
        'RUN_CONCURRENCY_LIMITED',
        'Too many agent runs are already in progress',
        { 'Retry-After': '1' },
      )
      return
    }

    activeByUser.set(userId, active + 1)
    let released = false
    const release = () => {
      if (released) return
      released = true

      const remaining = (activeByUser.get(userId) ?? 1) - 1
      if (remaining <= 0) activeByUser.delete(userId)
      else activeByUser.set(userId, remaining)
    }

    res.once('finish', release)
    res.once('close', release)
    next()
  }
}
