type UnauthorizedHandler = () => void

let unauthorizedHandler: UnauthorizedHandler | null = null
let unauthorizedNotified = false

export class ApiError extends Error {
  readonly status: number
  readonly body: string

  constructor(message: string, status: number, body: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

export function setUnauthorizedHandler(handler: UnauthorizedHandler) {
  unauthorizedHandler = handler
  unauthorizedNotified = false

  return () => {
    if (unauthorizedHandler === handler) {
      unauthorizedHandler = null
    }
  }
}

export function resetUnauthorizedNotification() {
  unauthorizedNotified = false
}

export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const response = await fetch(input, {
    ...init,
    credentials: init.credentials ?? 'include',
  })

  if (response.status === 401 && unauthorizedHandler && !unauthorizedNotified) {
    unauthorizedNotified = true
    unauthorizedHandler()
  }

  return response
}

function errorMessage(body: string, status: number) {
  if (!body) return `HTTP ${status}`

  try {
    const parsed = JSON.parse(body) as { error?: string; message?: string }
    return parsed.message || parsed.error || `HTTP ${status}`
  } catch {
    return body
  }
}

export async function parseJsonResponse<T>(response: Response): Promise<T> {
  if (response.ok) {
    return (await response.json()) as T
  }

  const body = await response.text()
  throw new ApiError(errorMessage(body, response.status), response.status, body)
}
