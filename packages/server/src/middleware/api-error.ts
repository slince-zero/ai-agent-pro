import type { ErrorRequestHandler, Request, Response } from 'express'

export type ApiErrorCode =
  | 'AUTH_REQUIRED'
  | 'FORBIDDEN_ORIGIN'
  | 'INTERNAL_ERROR'
  | 'INVALID_JSON'
  | 'NOT_FOUND'
  | 'PAYLOAD_TOO_LARGE'
  | 'RATE_LIMITED'
  | 'URI_TOO_LONG'

export type ApiErrorBody = {
  error: string
  code: string
  requestId?: string
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ApiErrorCode | string,
    message: string,
    public readonly headers?: Record<string, string>,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export function sendApiError(
  req: Request,
  res: Response,
  status: number,
  code: ApiErrorCode | string,
  message: string,
  headers?: Record<string, string>,
) {
  if (headers) res.set(headers)

  const body: ApiErrorBody = {
    error: message,
    code,
  }

  if (req.id) body.requestId = String(req.id)
  return res.status(status).json(body)
}

type BodyParserError = Error & {
  status?: number
  type?: string
}

export const apiErrorHandler: ErrorRequestHandler = (error, req, res, next) => {
  if (res.headersSent) {
    next(error)
    return
  }

  if (error instanceof ApiError) {
    sendApiError(req, res, error.status, error.code, error.message, error.headers)
    return
  }

  const bodyParserError = error as BodyParserError
  if (bodyParserError.type === 'entity.too.large' || bodyParserError.status === 413) {
    sendApiError(req, res, 413, 'PAYLOAD_TOO_LARGE', 'Request body is too large')
    return
  }

  if (bodyParserError instanceof SyntaxError && bodyParserError.status === 400) {
    sendApiError(req, res, 400, 'INVALID_JSON', 'Request body contains invalid JSON')
    return
  }

  req.log.error({ err: error }, 'unhandled error')
  sendApiError(req, res, 500, 'INTERNAL_ERROR', 'Internal Server Error')
}
