const REDACTED = '[Redacted]'
const SENSITIVE_KEY =
  /(?:^|[-_])(authorization|cookie|password|passwd|secret|token|api[-_]?key|signature)(?:$|[-_])/i
const SENSITIVE_QUERY_KEY = /^(?:code|key|password|secret|signature|token|api_key|access_token)$/i

const secretPatterns = [
  /\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi,
  /\b(?:sk[-_]|re_|ghp_|github_pat_)[A-Za-z0-9_-]{8,}\b/g,
]

export function redactUrl(value: string) {
  const queryIndex = value.indexOf('?')
  if (queryIndex === -1) return value

  const path = value.slice(0, queryIndex)
  const hashIndex = value.indexOf('#', queryIndex)
  const query = value.slice(queryIndex + 1, hashIndex === -1 ? undefined : hashIndex)
  const fragment = hashIndex === -1 ? '' : value.slice(hashIndex)
  const params = new URLSearchParams(query)

  for (const key of params.keys()) {
    if (SENSITIVE_QUERY_KEY.test(key)) params.set(key, REDACTED)
  }

  const sanitized = params.toString()
  return `${path}${sanitized ? `?${sanitized}` : ''}${fragment}`
}

export function redactString(value: string) {
  let redacted = redactUrl(value)
  for (const pattern of secretPatterns) redacted = redacted.replace(pattern, REDACTED)
  return redacted
}

export function redactSensitive(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === 'string') return redactString(value)
  if (value === null || typeof value !== 'object') return value
  if (seen.has(value)) return '[Circular]'

  seen.add(value)

  if (value instanceof Error) {
    const redacted = new Error(redactString(value.message))
    redacted.name = value.name
    redacted.stack = value.stack ? redactString(value.stack) : undefined
    Object.assign(redacted, redactSensitive({ ...value }, seen))
    return redacted
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactSensitive(item, seen))
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      SENSITIVE_KEY.test(key) ? REDACTED : redactSensitive(item, seen),
    ]),
  )
}

export const loggerRedactPaths = [
  'authorization',
  'cookie',
  'password',
  'token',
  'apiKey',
  'secret',
  'signature',
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers.x-api-key',
  'req.headers.x-signature',
  'req.body.password',
  'req.body.token',
  'req.body.apiKey',
  'req.body.secret',
]
