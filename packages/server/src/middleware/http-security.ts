import type { CorsOptions } from 'cors'
import type { RequestHandler } from 'express'

import { ApiError } from './api-error.js'

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
const FORBIDDEN_TRUST_PROXY = new Set(['true', '*', '0', '0.0.0.0/0', '::/0'])

type SecurityOptions = {
  allowedOrigins: string[]
  maxBodyBytes: number
  maxUrlChars: number
  production: boolean
}

function normalizedOrigin(value: string) {
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol)) return null
    return url.origin
  } catch {
    return null
  }
}

export function parseTrustProxy(value: string | undefined): false | number | string[] {
  if (!value) return false

  const normalized = value.trim().toLowerCase()
  if (FORBIDDEN_TRUST_PROXY.has(normalized)) {
    throw new Error('TRUST_PROXY must name a bounded proxy hop count, IP, subnet, or named subnet')
  }

  if (/^\d+$/.test(normalized)) {
    const hops = Number(normalized)
    if (hops >= 1 && hops <= 10) return hops
    throw new Error('TRUST_PROXY hop count must be between 1 and 10')
  }

  const proxies = value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

  if (
    proxies.length === 0 ||
    proxies.some((proxy) => FORBIDDEN_TRUST_PROXY.has(proxy.toLowerCase()))
  ) {
    throw new Error('TRUST_PROXY contains an unsafe proxy range')
  }

  return proxies
}

export function resolveAllowedOrigins(values: Array<string | undefined>) {
  const origins = values
    .flatMap((value) => value?.split(',') ?? [])
    .map((value) => value.trim())
    .filter(Boolean)
    .map(normalizedOrigin)

  if (origins.some((origin) => origin === null)) {
    throw new Error('Allowed origins must be valid HTTP(S) URLs')
  }

  return [...new Set(origins as string[])]
}

export function createCorsOptions(allowedOrigins: string[]): CorsOptions {
  const allowed = new Set(allowedOrigins)

  return {
    credentials: true,
    origin(origin, callback) {
      if (!origin) {
        callback(null, false)
        return
      }

      const normalized = normalizedOrigin(origin)
      callback(null, normalized !== null && allowed.has(normalized) ? normalized : false)
    },
  }
}

export function createSecurityHeaders({
  production,
}: Pick<SecurityOptions, 'production'>): RequestHandler {
  return (_req, res, next) => {
    res.set({
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Resource-Policy': 'same-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
    })

    if (production) {
      res.set({
        'Content-Security-Policy': [
          "default-src 'self'",
          "base-uri 'self'",
          "frame-ancestors 'none'",
          "object-src 'none'",
          "form-action 'self'",
          "img-src 'self' data:",
          "script-src 'self'",
          "style-src 'self' 'unsafe-inline'",
          "connect-src 'self'",
          "font-src 'self'",
        ].join('; '),
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
      })
    }

    next()
  }
}

export function createRequestBounds({
  maxBodyBytes,
  maxUrlChars,
}: SecurityOptions): RequestHandler {
  return (req, _res, next) => {
    if (req.originalUrl.length > maxUrlChars) {
      next(new ApiError(414, 'URI_TOO_LONG', 'Request URL is too long'))
      return
    }

    const contentLength = req.get('content-length')
    if (contentLength !== undefined) {
      const parsed = Number(contentLength)
      if (!Number.isSafeInteger(parsed) || parsed < 0) {
        next(new ApiError(400, 'INVALID_CONTENT_LENGTH', 'Content-Length is invalid'))
        return
      }

      if (parsed > maxBodyBytes) {
        next(new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large'))
        return
      }
    }

    next()
  }
}

export function createBodyTypeGuard(allowedTypes: string[]): RequestHandler {
  const allowed = new Set(allowedTypes.map((type) => type.toLowerCase()))

  return (req, _res, next) => {
    if (!UNSAFE_METHODS.has(req.method)) {
      next()
      return
    }

    const contentLength = req.get('content-length')
    const hasBody =
      req.get('transfer-encoding') !== undefined ||
      (contentLength !== undefined && contentLength !== '0')
    const contentType = req.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()

    if (hasBody && (!contentType || !allowed.has(contentType))) {
      next(new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Request content type is not supported'))
      return
    }

    next()
  }
}

function isWebhookMachineRequest(path: string, hasCookie: boolean) {
  return path.startsWith('/api/webhooks/') && !hasCookie
}

export function createOriginGuard({
  allowedOrigins,
}: Pick<SecurityOptions, 'allowedOrigins'>): RequestHandler {
  const allowed = new Set(allowedOrigins)

  return (req, _res, next) => {
    const hasCookie = Boolean(req.get('cookie'))
    if (isWebhookMachineRequest(req.originalUrl, hasCookie)) {
      next()
      return
    }

    const originHeader = req.get('origin')
    const origin = originHeader ? normalizedOrigin(originHeader) : null
    const fetchSite = req.get('sec-fetch-site')?.toLowerCase()

    if (fetchSite === 'cross-site' && UNSAFE_METHODS.has(req.method)) {
      next(new ApiError(403, 'FORBIDDEN_ORIGIN', 'Cross-site request is not allowed'))
      return
    }

    if (originHeader && (!origin || !allowed.has(origin))) {
      next(new ApiError(403, 'FORBIDDEN_ORIGIN', 'Request origin is not allowed'))
      return
    }

    if (UNSAFE_METHODS.has(req.method) && hasCookie && !originHeader) {
      next(new ApiError(403, 'FORBIDDEN_ORIGIN', 'Origin header is required'))
      return
    }

    next()
  }
}
