import assert from 'node:assert/strict'
import { test } from 'node:test'

import { memoryAdapter } from 'better-auth/adapters/memory'

import { createAccountSendRateLimiter } from './services/account-send-rate-limit.js'
import { createMemoryEmailVerificationTokenStore } from './services/email-verification-token.js'
import type {
  TransactionalEmail,
  TransactionalEmailSender,
} from './services/transactional-email.js'

process.env.OPENAI_API_KEY = 'test-api-key'
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test'
process.env.NODE_ENV = 'test'

const { createAuth } = await import('./auth.js')

const authBaseURL = 'http://auth.example.com'
const appURL = 'http://app.example.com/'

function createAuthDatabase() {
  return {
    user: [] as Record<string, unknown>[],
    authSession: [] as Record<string, unknown>[],
    account: [] as Record<string, unknown>[],
    verification: [] as Record<string, unknown>[],
  }
}

function captureEmail() {
  const messages: TransactionalEmail[] = []
  const sender: TransactionalEmailSender = {
    async send(message) {
      messages.push(message)
    },
  }
  return { messages, sender }
}

function requestFor(path: string, init: RequestInit = {}) {
  return new Request(`${authBaseURL}/api/auth${path}`, {
    ...init,
    headers: {
      origin: authBaseURL,
      ...init.headers,
    },
  })
}

function jsonPost(path: string, body: unknown, headers: Record<string, string> = {}) {
  return requestFor(path, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  })
}

function linkFrom(message: TransactionalEmail) {
  const link = message.text.match(/https?:\/\/\S+/)?.[0]
  assert.ok(link)
  return new URL(link)
}

function cookieFrom(response: Response) {
  const setCookie = response.headers.get('set-cookie')
  assert.ok(setCookie)
  return setCookie.split(';', 1)[0]
}

test('enforces one-time email verification and revokes sessions after password reset', async () => {
  const database = createAuthDatabase()
  const email = captureEmail()
  const secureAuth = createAuth({
    database: memoryAdapter(database),
    baseURL: authBaseURL,
    appURL,
    secret: 'test-secret-with-at-least-32-characters',
    secureCookies: false,
    emailSender: email.sender,
    emailVerificationTokens: createMemoryEmailVerificationTokenStore(),
    rateLimitEnabled: false,
  })

  const signUpResponse = await secureAuth.handler(
    jsonPost('/sign-up/email', {
      name: 'Security User',
      email: 'security@example.com',
      password: 'password123',
    }),
  )
  const signUpBody = (await signUpResponse.json()) as {
    token: string | null
    user: { emailVerified: boolean }
  }

  assert.equal(signUpResponse.status, 200)
  assert.equal(signUpBody.token, null)
  assert.equal(signUpBody.user.emailVerified, false)
  assert.equal(signUpResponse.headers.has('set-cookie'), false)
  assert.equal(email.messages.length, 1)

  const blockedSignIn = await secureAuth.handler(
    jsonPost('/sign-in/email', {
      email: 'security@example.com',
      password: 'password123',
    }),
  )
  const blockedBody = (await blockedSignIn.json()) as { code: string }
  assert.equal(blockedSignIn.status, 403)
  assert.equal(blockedBody.code, 'EMAIL_NOT_VERIFIED')

  const verificationUrl = linkFrom(email.messages[0]!)
  assert.equal(verificationUrl.origin, authBaseURL)
  assert.equal(verificationUrl.pathname, '/api/auth/verify-email')
  assert.equal(
    verificationUrl.searchParams.get('callbackURL'),
    `${appURL}?auth_action=email-verified`,
  )

  const verifiedResponse = await secureAuth.handler(new Request(verificationUrl))
  assert.equal(verifiedResponse.status, 302)
  assert.equal(verifiedResponse.headers.get('location'), `${appURL}?auth_action=email-verified`)

  const reusedResponse = await secureAuth.handler(new Request(verificationUrl))
  assert.equal(reusedResponse.status, 302)
  assert.equal(
    reusedResponse.headers.get('location'),
    `${appURL}?auth_action=email-verification-error`,
  )

  const forgedUrl = new URL(verificationUrl)
  forgedUrl.searchParams.set('token', 'forged-token')
  const forgedResponse = await secureAuth.handler(new Request(forgedUrl))
  assert.equal(forgedResponse.status, 302)
  assert.equal(
    forgedResponse.headers.get('location'),
    `${appURL}?auth_action=email-verification-error`,
  )

  const firstSignIn = await secureAuth.handler(
    jsonPost('/sign-in/email', {
      email: 'security@example.com',
      password: 'password123',
    }),
  )
  const secondSignIn = await secureAuth.handler(
    jsonPost('/sign-in/email', {
      email: 'security@example.com',
      password: 'password123',
    }),
  )
  assert.equal(firstSignIn.status, 200)
  assert.equal(secondSignIn.status, 200)
  const firstCookie = cookieFrom(firstSignIn)
  const secondCookie = cookieFrom(secondSignIn)

  const resetRequest = await secureAuth.handler(
    jsonPost('/request-password-reset', { email: 'security@example.com' }),
  )
  const unknownResetRequest = await secureAuth.handler(
    jsonPost('/request-password-reset', { email: 'unknown@example.com' }),
  )
  const resetRequestBody = await resetRequest.json()
  const unknownResetBody = await unknownResetRequest.json()

  assert.equal(resetRequest.status, 200)
  assert.equal(unknownResetRequest.status, 200)
  assert.deepEqual(unknownResetBody, resetRequestBody)

  const resetMessage = email.messages.findLast((message) => message.subject.includes('重置'))
  assert.ok(resetMessage)
  const resetUrl = linkFrom(resetMessage)
  assert.equal(resetUrl.origin, new URL(appURL).origin)
  const resetParams = new URLSearchParams(resetUrl.hash.slice(1))
  assert.equal(resetParams.get('auth_action'), 'reset-password')
  const resetToken = resetParams.get('token')
  assert.ok(resetToken)

  const resetResponse = await secureAuth.handler(
    jsonPost('/reset-password', {
      token: resetToken,
      newPassword: 'new-password123',
    }),
  )
  assert.equal(resetResponse.status, 200)

  const reusedResetResponse = await secureAuth.handler(
    jsonPost('/reset-password', {
      token: resetToken,
      newPassword: 'another-password123',
    }),
  )
  assert.equal(reusedResetResponse.status, 400)
  assert.equal(((await reusedResetResponse.json()) as { code: string }).code, 'INVALID_TOKEN')

  for (const cookie of [firstCookie, secondCookie]) {
    const sessionResponse = await secureAuth.handler(
      requestFor('/get-session', { headers: { cookie } }),
    )
    assert.equal(await sessionResponse.json(), null)
  }

  const oldPasswordResponse = await secureAuth.handler(
    jsonPost('/sign-in/email', {
      email: 'security@example.com',
      password: 'password123',
    }),
  )
  const newPasswordResponse = await secureAuth.handler(
    jsonPost('/sign-in/email', {
      email: 'security@example.com',
      password: 'new-password123',
    }),
  )

  assert.equal(oldPasswordResponse.status, 401)
  assert.equal(newPasswordResponse.status, 200)
})

test('rate limits email sends by normalized account without revealing existence', async () => {
  const email = captureEmail()
  const limitedAuth = createAuth({
    database: memoryAdapter(createAuthDatabase()),
    baseURL: authBaseURL,
    appURL,
    secret: 'test-secret-with-at-least-32-characters',
    emailSender: email.sender,
    emailVerificationTokens: createMemoryEmailVerificationTokenStore(),
    accountSendRateLimiter: createAccountSendRateLimiter({ max: 1, windowSeconds: 60 }),
    rateLimitEnabled: false,
  })

  const first = await limitedAuth.handler(
    jsonPost('/request-password-reset', { email: 'UNKNOWN@example.com' }),
  )
  const second = await limitedAuth.handler(
    jsonPost('/request-password-reset', { email: 'unknown@example.com' }),
  )

  assert.equal(first.status, 200)
  assert.equal(second.status, 429)
  assert.equal(second.headers.get('retry-after'), '60')
  assert.equal(((await second.json()) as { code: string }).code, 'ACCOUNT_SEND_RATE_LIMITED')
})
