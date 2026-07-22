import assert from 'node:assert/strict'
import type { Server } from 'node:http'
import { after, before, test } from 'node:test'

import { memoryAdapter } from 'better-auth/adapters/memory'
import { toNodeHandler } from 'better-auth/node'
import express from 'express'

process.env.OPENAI_API_KEY = 'test-api-key'
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test'
process.env.NODE_ENV = 'test'

const { createAuth, parseTrustedOrigins } = await import('./auth.js')

function createAuthDatabase() {
  return {
    user: [] as Record<string, unknown>[],
    authSession: [] as Record<string, unknown>[],
    account: [] as Record<string, unknown>[],
    verification: [] as Record<string, unknown>[],
  }
}

const authDatabase = createAuthDatabase()

let server: Server
let baseUrl: string

before(async () => {
  const testAuth = createAuth({
    database: memoryAdapter(authDatabase),
    baseURL: 'http://127.0.0.1:3003',
    secret: 'test-secret-with-at-least-32-characters',
    secureCookies: false,
    requireEmailVerification: false,
    rateLimitEnabled: false,
  })
  const { createRequireAuth } = await import('./middleware/auth.js')
  const app = express()

  app.all('/api/auth/*splat', toNodeHandler(testAuth))
  app.use(
    '/api/protected',
    createRequireAuth({
      getSession: (headers) => testAuth.api.getSession({ headers }),
    }),
  )
  app.get('/api/protected', (req, res) => {
    res.json({ userId: req.auth.user.id, email: req.auth.user.email })
  })
  app.use(express.json())

  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => resolve())
  })

  const address = server.address()
  assert.ok(address && typeof address === 'object')
  baseUrl = `http://127.0.0.1:${address.port}`
})

after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
  })
})

function authRequest(path: string, init: RequestInit = {}) {
  return fetch(`${baseUrl}/api/auth${path}`, {
    ...init,
    headers: {
      origin: 'http://127.0.0.1:3003',
      ...init.headers,
    },
  })
}

function sessionCookieHeader(response: Response): string {
  const setCookie = response.headers.get('set-cookie')
  assert.ok(setCookie)
  return setCookie
}

function sessionCookie(response: Response): string {
  const cookie = sessionCookieHeader(response).split(';', 1)[0]
  assert.ok(cookie)
  return cookie
}

test('parses and deduplicates trusted origins', () => {
  assert.deepEqual(
    parseTrustedOrigins(
      ' https://app.example.com,https://admin.example.com,https://app.example.com ',
    ),
    ['https://app.example.com', 'https://admin.example.com'],
  )
})

test('supports email sign-up, session lookup, sign-out and sign-in', async () => {
  const weakPasswordResponse = await authRequest('/sign-up/email', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      name: 'Weak Password',
      email: 'weak@example.com',
      password: 'short',
    }),
  })
  const weakPasswordBody = (await weakPasswordResponse.json()) as { code: string }

  assert.equal(weakPasswordResponse.status, 400)
  assert.equal(weakPasswordBody.code, 'PASSWORD_TOO_SHORT')

  const signUpResponse = await authRequest('/sign-up/email', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      name: 'Test User',
      email: 'test@example.com',
      password: 'password123',
    }),
  })

  assert.equal(signUpResponse.status, 200)
  const signUpBody = (await signUpResponse.json()) as {
    user: { email: string }
  }
  assert.equal(signUpBody.user.email, 'test@example.com')

  const setCookie = sessionCookieHeader(signUpResponse)
  assert.match(setCookie, /HttpOnly/i)
  assert.match(setCookie, /SameSite=Lax/i)
  assert.doesNotMatch(setCookie, /;\s*Secure/i)

  const cookie = sessionCookie(signUpResponse)
  const protectedResponse = await fetch(`${baseUrl}/api/protected`, {
    headers: { cookie },
  })
  const protectedBody = (await protectedResponse.json()) as { email: string; userId: string }
  assert.equal(protectedResponse.status, 200)
  assert.equal(protectedBody.email, 'test@example.com')
  assert.ok(protectedBody.userId)

  const sessionResponse = await authRequest('/get-session', {
    headers: {
      cookie,
    },
  })
  const sessionBody = (await sessionResponse.json()) as {
    user: { email: string }
  }

  assert.equal(sessionResponse.status, 200)
  assert.equal(sessionBody.user.email, 'test@example.com')

  const duplicateResponse = await authRequest('/sign-up/email', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      name: 'Duplicate User',
      email: 'test@example.com',
      password: 'another-password',
    }),
  })
  const duplicateBody = (await duplicateResponse.json()) as { code: string }

  assert.equal(duplicateResponse.status, 422)
  assert.equal(duplicateBody.code, 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL')
  assert.equal(JSON.stringify(duplicateBody).includes('another-password'), false)

  const invalidCredentialsResponse = await authRequest('/sign-in/email', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      email: 'test@example.com',
      password: 'wrong-password',
    }),
  })
  const invalidCredentialsBody = (await invalidCredentialsResponse.json()) as { code: string }

  assert.equal(invalidCredentialsResponse.status, 401)
  assert.equal(invalidCredentialsBody.code, 'INVALID_EMAIL_OR_PASSWORD')
  assert.equal(JSON.stringify(invalidCredentialsBody).includes('wrong-password'), false)

  const signOutResponse = await authRequest('/sign-out', {
    method: 'POST',
    headers: {
      cookie,
    },
  })
  assert.equal(signOutResponse.status, 200)

  const signedOutProtectedResponse = await fetch(`${baseUrl}/api/protected`, {
    headers: { cookie },
  })
  assert.equal(signedOutProtectedResponse.status, 401)

  const signedOutSessionResponse = await authRequest('/get-session', {
    headers: {
      cookie,
    },
  })
  assert.equal(await signedOutSessionResponse.json(), null)

  const invalidSessionResponse = await authRequest('/get-session', {
    headers: {
      cookie: 'better-auth.session_token=invalid',
    },
  })
  assert.equal(await invalidSessionResponse.json(), null)

  const signInResponse = await authRequest('/sign-in/email', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      email: 'test@example.com',
      password: 'password123',
    }),
  })

  assert.equal(signInResponse.status, 200)
  const signedInCookie = sessionCookie(signInResponse)
  assert.match(signedInCookie, /^better-auth\.session_token=/)

  for (const session of authDatabase.authSession) {
    session.expiresAt = new Date(0)
  }

  const expiredSessionResponse = await authRequest('/get-session', {
    headers: {
      cookie: signedInCookie,
    },
  })
  assert.equal(await expiredSessionResponse.json(), null)
})

test('uses secure session cookies when configured for production', async () => {
  const secureAuth = createAuth({
    database: memoryAdapter(createAuthDatabase()),
    baseURL: 'https://agent.example.com',
    secret: 'test-secret-with-at-least-32-characters',
    secureCookies: true,
    requireEmailVerification: false,
    rateLimitEnabled: false,
  })
  const response = await secureAuth.handler(
    new Request('https://agent.example.com/api/auth/sign-up/email', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'https://agent.example.com',
      },
      body: JSON.stringify({
        name: 'Secure Cookie User',
        email: 'secure@example.com',
        password: 'password123',
      }),
    }),
  )

  assert.equal(response.status, 200)
  const setCookie = sessionCookieHeader(response)
  assert.match(setCookie, /^__Secure-better-auth\.session_token=/)
  assert.match(setCookie, /;\s*Secure/i)
  assert.match(setCookie, /HttpOnly/i)
  assert.match(setCookie, /SameSite=Lax/i)
})
