import { betterAuth, type BetterAuthOptions } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { APIError, createAuthMiddleware } from 'better-auth/api'

import { prisma } from './db/client.js'
import { env } from './env.js'
import { logger } from './logger.js'
import {
  createAccountSendRateLimiter,
  type AccountSendRateLimiter,
} from './services/account-send-rate-limit.js'
import {
  emailVerificationCallbackUrl,
  emailVerificationMessage,
  emailVerificationUrl,
  passwordResetMessage,
  passwordResetUrl,
} from './services/auth-email.js'
import { type EmailVerificationTokenStore } from './services/email-verification-token.js'
import { prismaEmailVerificationTokenStore } from './services/prisma-email-verification-token.js'
import {
  createConsoleEmailSender,
  createResendEmailSender,
  type TransactionalEmailSender,
} from './services/transactional-email.js'

export const AUTH_BASE_PATH = '/api/auth'

const developmentSecret = 'ai-agent-pro-development-only-auth-secret'
const EMAIL_VERIFICATION_EXPIRES_IN_SECONDS = 30 * 60
const PASSWORD_RESET_EXPIRES_IN_SECONDS = 15 * 60

type CreateAuthOptions = {
  database?: NonNullable<BetterAuthOptions['database']>
  baseURL?: string
  secret?: string
  trustedOrigins?: string[]
  secureCookies?: boolean
  appURL?: string
  emailSender?: TransactionalEmailSender
  emailVerificationTokens?: EmailVerificationTokenStore
  accountSendRateLimiter?: AccountSendRateLimiter
  requireEmailVerification?: boolean
  rateLimitEnabled?: boolean
}

export function parseTrustedOrigins(value: string | undefined): string[] {
  if (!value) return []

  return [
    ...new Set(
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
  ]
}

export function createAuth(options: CreateAuthOptions = {}) {
  const baseURL = options.baseURL ?? env.BETTER_AUTH_URL ?? `http://localhost:${env.PORT}`
  const appURL =
    options.appURL ??
    env.AUTH_APP_URL ??
    (env.NODE_ENV === 'development' ? 'http://localhost:5173' : baseURL)
  const requireEmailVerification = options.requireEmailVerification ?? true
  const emailVerificationTokens =
    options.emailVerificationTokens ?? prismaEmailVerificationTokenStore
  const accountSendRateLimiter = options.accountSendRateLimiter ?? createAccountSendRateLimiter()
  const emailSender = options.emailSender ?? createDefaultEmailSender()
  const trustedOrigins = [
    ...(options.trustedOrigins ?? parseTrustedOrigins(env.AUTH_TRUSTED_ORIGINS)),
    new URL(appURL).origin,
  ]

  const before = createAuthMiddleware(async (context) => {
    if (context.path === '/request-password-reset' || context.path === '/send-verification-email') {
      const email = (context.body as { email?: unknown }).email

      if (typeof email === 'string') {
        const decision = accountSendRateLimiter.consume(context.path, email)
        if (!decision.allowed) {
          throw new APIError(
            'TOO_MANY_REQUESTS',
            {
              code: 'ACCOUNT_SEND_RATE_LIMITED',
              message: '请求过于频繁，请稍后再试。',
            },
            { 'Retry-After': String(decision.retryAfterSeconds) },
          )
        }
      }
    }

    if (context.path === '/verify-email') {
      const query = context.query as { token?: unknown; callbackURL?: string }
      const token = query.token

      query.callbackURL = emailVerificationCallbackUrl(appURL, true)

      if (typeof token !== 'string' || !(await emailVerificationTokens.consume(token))) {
        throw context.redirect(emailVerificationCallbackUrl(appURL, false))
      }
    }
  })

  return betterAuth({
    appName: 'ai-agent-pro',
    baseURL,
    basePath: AUTH_BASE_PATH,
    secret: options.secret ?? env.BETTER_AUTH_SECRET ?? developmentSecret,
    database:
      options.database ??
      prismaAdapter(prisma, {
        provider: 'postgresql',
      }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      autoSignIn: !requireEmailVerification,
      requireEmailVerification,
      resetPasswordTokenExpiresIn: PASSWORD_RESET_EXPIRES_IN_SECONDS,
      revokeSessionsOnPasswordReset: true,
      async sendResetPassword({ user, token }) {
        const url = passwordResetUrl(appURL, token)
        await emailSender.send(
          passwordResetMessage({
            to: user.email,
            url,
            token,
          }),
        )
      },
    },
    emailVerification: {
      expiresIn: EMAIL_VERIFICATION_EXPIRES_IN_SECONDS,
      sendOnSignUp: requireEmailVerification,
      sendOnSignIn: false,
      autoSignInAfterVerification: false,
      async sendVerificationEmail({ user, token }) {
        await emailVerificationTokens.issue(token, user.id, EMAIL_VERIFICATION_EXPIRES_IN_SECONDS)
        const url = emailVerificationUrl(baseURL, appURL, token)
        await emailSender.send(
          emailVerificationMessage({
            to: user.email,
            url,
            token,
          }),
        )
      },
    },
    session: {
      modelName: 'authSession',
    },
    trustedOrigins: [...new Set(trustedOrigins)],
    rateLimit: {
      enabled: options.rateLimitEnabled ?? true,
    },
    hooks: { before },
    advanced: {
      useSecureCookies: options.secureCookies ?? env.NODE_ENV === 'production',
    },
    telemetry: {
      enabled: false,
    },
  })
}

function createDefaultEmailSender() {
  if (env.AUTH_EMAIL_PROVIDER === 'resend') {
    return createResendEmailSender({
      apiKey: env.RESEND_API_KEY!,
      from: env.AUTH_EMAIL_FROM!,
    })
  }

  return createConsoleEmailSender(logger)
}

export const auth = createAuth()
