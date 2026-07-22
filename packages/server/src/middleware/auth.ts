import { fromNodeHeaders } from 'better-auth/node'
import type { NextFunction, Request, RequestHandler, Response } from 'express'

import { auth } from '../auth.js'
import { sendApiError } from './api-error.js'

export type AuthenticatedSession = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>

type GetSession = (headers: Headers) => Promise<AuthenticatedSession | null>

type RequireAuthDeps = {
  getSession?: GetSession
}

export function createRequireAuth({
  getSession = (headers) => auth.api.getSession({ headers }),
}: RequireAuthDeps = {}): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const session = await getSession(fromNodeHeaders(req.headers))

      if (!session) {
        sendApiError(req, res, 401, 'AUTH_REQUIRED', 'Unauthorized')
        return
      }

      req.auth = session
      next()
    } catch (error) {
      next(error)
    }
  }
}

export const requireAuth = createRequireAuth()
