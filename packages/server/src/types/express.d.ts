import type { AuthenticatedSession } from '../middleware/auth.js'

declare global {
  namespace Express {
    interface Request {
      auth: AuthenticatedSession
    }
  }
}
