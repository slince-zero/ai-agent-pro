import assert from 'node:assert/strict'
import { afterEach, mock, test } from 'node:test'

import {
  AuthError,
  getSession,
  invalidateSessionCache,
  signIn,
  signOut,
  signUp,
  validateAuthFields,
} from './auth.ts'

const user = {
  id: 'user-1',
  name: 'Test User',
  email: 'test@example.com',
  emailVerified: false,
}

afterEach(() => {
  mock.restoreAll()
  invalidateSessionCache()
})

test('restores and caches the cookie session during startup', async () => {
  const fetchMock = mock.method(globalThis, 'fetch', async () =>
    Response.json({ user, session: { id: 'session-1' } }),
  )

  const first = await getSession()
  const second = await getSession()

  assert.equal(first?.user.email, user.email)
  assert.equal(second, first)
  assert.equal(fetchMock.mock.callCount(), 1)
  assert.equal(fetchMock.mock.calls[0]?.arguments[0], '/api/auth/get-session')
  assert.equal(fetchMock.mock.calls[0]?.arguments[1]?.credentials, 'include')
})

test('treats an expired session as unauthenticated', async () => {
  mock.method(globalThis, 'fetch', async () => Response.json(null))

  assert.equal(await getSession(), null)
})

test('registers with normalized profile fields and returns the user', async () => {
  const fetchMock = mock.method(globalThis, 'fetch', async () => Response.json({ user }))

  const registered = await signUp('  Test User  ', '  test@example.com  ', 'password123')
  const request = fetchMock.mock.calls[0]
  const init = request?.arguments[1]

  assert.equal(registered.id, user.id)
  assert.equal(request?.arguments[0], '/api/auth/sign-up/email')
  assert.equal(init?.credentials, 'include')
  assert.deepEqual(JSON.parse(String(init?.body)), {
    name: 'Test User',
    email: 'test@example.com',
    password: 'password123',
  })
})

test('signs in with email credentials and returns the user', async () => {
  const fetchMock = mock.method(globalThis, 'fetch', async () => Response.json({ user }))

  const signedIn = await signIn('  test@example.com  ', 'password123')
  const request = fetchMock.mock.calls[0]
  const init = request?.arguments[1]

  assert.equal(signedIn.email, user.email)
  assert.equal(request?.arguments[0], '/api/auth/sign-in/email')
  assert.deepEqual(JSON.parse(String(init?.body)), {
    email: 'test@example.com',
    password: 'password123',
  })
})

test('maps duplicate registration errors without exposing server details', async () => {
  mock.method(globalThis, 'fetch', async () =>
    Response.json(
      { code: 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL', message: 'server detail' },
      { status: 422 },
    ),
  )

  await assert.rejects(
    () => signUp('Test User', 'test@example.com', 'password123'),
    (error: unknown) => {
      assert.ok(error instanceof AuthError)
      assert.equal(error.code, 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL')
      assert.equal(error.message, '该邮箱已注册。')
      return true
    },
  )
})

test('maps invalid credentials without triggering a business API retry', async () => {
  const fetchMock = mock.method(globalThis, 'fetch', async () =>
    Response.json({ code: 'INVALID_EMAIL_OR_PASSWORD' }, { status: 401 }),
  )

  await assert.rejects(
    () => signIn('test@example.com', 'wrong-password'),
    (error: unknown) => {
      assert.ok(error instanceof AuthError)
      assert.equal(error.message, '邮箱或密码错误。')
      return true
    },
  )
  assert.equal(fetchMock.mock.callCount(), 1)
})

test('signs out through the cookie-auth endpoint', async () => {
  const fetchMock = mock.method(globalThis, 'fetch', async () => Response.json({ success: true }))

  await signOut()

  assert.equal(fetchMock.mock.calls[0]?.arguments[0], '/api/auth/sign-out')
  assert.equal(fetchMock.mock.calls[0]?.arguments[1]?.method, 'POST')
  assert.equal(fetchMock.mock.calls[0]?.arguments[1]?.credentials, 'include')
})

test('validates login and registration fields before submission', () => {
  assert.deepEqual(
    validateAuthFields('sign-in', { name: '', email: 'invalid', password: 'short' }),
    {
      email: '请输入有效的邮箱地址。',
      password: '密码至少需要 8 位。',
    },
  )
  assert.deepEqual(validateAuthFields('sign-up', { name: '', email: '', password: '' }), {
    name: '请输入你的称呼。',
    email: '请输入邮箱地址。',
    password: '请输入密码。',
  })
})
