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
  INVALID_EMAIL: '请输入有效的邮箱地址。',
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

export async function signOut() {
  const response = await jsonPost('/sign-out')
  await readAuthResponse<Record<string, unknown>>(response)
  invalidateSessionCache()
}
