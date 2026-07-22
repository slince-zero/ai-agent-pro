export type AuthUser = {
  id: string
  name: string
  email: string
  emailVerified: boolean
  image?: string | null
  createdAt?: string
  updatedAt?: string
}

export type AuthSession = {
  user: AuthUser
  session: Record<string, unknown>
}

export type AuthMode = 'sign-in' | 'sign-up'

export type AuthAction =
  | { type: 'email-verified' }
  | { type: 'email-verification-error' }
  | { type: 'reset-password-error' }
  | { type: 'reset-password'; token: string }

export type AuthFields = {
  name: string
  email: string
  password: string
}

export type AuthFieldErrors = Partial<Record<keyof AuthFields, string>>

type AuthResponse = {
  user: AuthUser
}

type AuthErrorBody = {
  code?: string
  message?: string
}

const errorMessages: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: '邮箱或密码错误。',
  USER_ALREADY_EXISTS: '该邮箱已注册。',
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: '该邮箱已注册。',
  PASSWORD_TOO_SHORT: '密码至少需要 8 位。',
  PASSWORD_TOO_LONG: '密码不能超过 128 位。',
  INVALID_EMAIL: '请输入有效的邮箱地址。',
  EMAIL_NOT_VERIFIED: '请先完成邮箱验证。',
  INVALID_TOKEN: '链接无效或已过期，请重新发起请求。',
  TOKEN_EXPIRED: '链接已过期，请重新发起请求。',
  ACCOUNT_SEND_RATE_LIMITED: '请求过于频繁，请稍后再试。',
}

let sessionRequest: Promise<AuthSession | null> | null = null

export class AuthError extends Error {
  readonly status: number
  readonly code?: string

  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'AuthError'
    this.status = status
    this.code = code
  }
}

async function readAuthResponse<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => null)) as AuthErrorBody | T | null

  if (response.ok) {
    return body as T
  }

  const authError = body as AuthErrorBody | null
  const message =
    (authError?.code && errorMessages[authError.code]) ||
    authError?.message ||
    '认证请求失败，请稍后重试。'

  throw new AuthError(message, response.status, authError?.code)
}

function authFetch(path: string, init: RequestInit = {}) {
  return fetch(`/api/auth${path}`, {
    ...init,
    credentials: 'include',
  })
}

function jsonPost(path: string, body?: unknown) {
  return authFetch(path, {
    method: 'POST',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

export function validateAuthFields(mode: AuthMode, fields: AuthFields): AuthFieldErrors {
  const errors: AuthFieldErrors = {}
  const email = fields.email.trim()

  if (mode === 'sign-up' && !fields.name.trim()) {
    errors.name = '请输入你的称呼。'
  } else if (fields.name.trim().length > 80) {
    errors.name = '称呼不能超过 80 个字符。'
  }

  if (!email) {
    errors.email = '请输入邮箱地址。'
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = '请输入有效的邮箱地址。'
  }

  if (!fields.password) {
    errors.password = '请输入密码。'
  } else if (fields.password.length < 8) {
    errors.password = '密码至少需要 8 位。'
  }

  return errors
}

export function validateEmail(email: string) {
  const normalized = email.trim()
  if (!normalized) return '请输入邮箱地址。'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return '请输入有效的邮箱地址。'
  return undefined
}

export function validateNewPassword(password: string, confirmation: string) {
  if (!password) return '请输入新密码。'
  if (password.length < 8) return '密码至少需要 8 位。'
  if (password.length > 128) return '密码不能超过 128 位。'
  if (password !== confirmation) return '两次输入的密码不一致。'
  return undefined
}

export function getAuthAction(search?: string, hash?: string): AuthAction | null {
  const query = search ?? (typeof window === 'undefined' ? '' : window.location.search)
  const fragment = hash ?? (typeof window === 'undefined' ? '' : window.location.hash)
  const queryParams = new URLSearchParams(query)
  const fragmentParams = new URLSearchParams(
    fragment.startsWith('#') ? fragment.slice(1) : fragment,
  )
  const params = fragmentParams.has('auth_action') ? fragmentParams : queryParams
  const action = params.get('auth_action')

  if (action === 'email-verified') return { type: 'email-verified' }
  if (action === 'email-verification-error') return { type: 'email-verification-error' }
  if (action === 'reset-password') {
    const token = params.get('token')
    return token ? { type: 'reset-password', token } : { type: 'reset-password-error' }
  }

  return null
}

export function getSession() {
  if (!sessionRequest) {
    sessionRequest = authFetch('/get-session').then((response) =>
      readAuthResponse<AuthSession | null>(response),
    )
  }

  return sessionRequest
}

export function invalidateSessionCache() {
  sessionRequest = null
}

export async function signIn(email: string, password: string) {
  const response = await jsonPost('/sign-in/email', {
    email: email.trim(),
    password,
  })
  const data = await readAuthResponse<AuthResponse>(response)
  invalidateSessionCache()
  return data.user
}

export async function signUp(name: string, email: string, password: string) {
  const response = await jsonPost('/sign-up/email', {
    name: name.trim(),
    email: email.trim(),
    password,
  })
  const data = await readAuthResponse<AuthResponse>(response)
  invalidateSessionCache()
  return data.user
}

export async function requestPasswordReset(email: string) {
  const response = await jsonPost('/request-password-reset', { email: email.trim() })
  await readAuthResponse<{ status: boolean }>(response)
}

export async function resendVerificationEmail(email: string) {
  const response = await jsonPost('/send-verification-email', { email: email.trim() })
  await readAuthResponse<{ status: boolean }>(response)
}

export async function resetPassword(token: string, newPassword: string) {
  const response = await jsonPost('/reset-password', { token, newPassword })
  await readAuthResponse<{ status: boolean }>(response)
  invalidateSessionCache()
}

export async function signOut() {
  const response = await jsonPost('/sign-out')
  await readAuthResponse<Record<string, unknown>>(response)
  invalidateSessionCache()
}
