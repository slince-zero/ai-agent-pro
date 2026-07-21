import { fromNodeHeaders } from 'better-auth/node'
import type { NextFunction, Request, RequestHandler, Response } from 'express'

import { auth } from '../auth.js'

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
        res.status(401).json({ error: 'Unauthorized' })
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
