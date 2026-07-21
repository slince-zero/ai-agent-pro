import { betterAuth, type BetterAuthOptions } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'

import { prisma } from './db/client.js'
import { env } from './env.js'

export const AUTH_BASE_PATH = '/api/auth'

const developmentSecret = 'ai-agent-pro-development-only-auth-secret'

type CreateAuthOptions = {
  database?: NonNullable<BetterAuthOptions['database']>
  baseURL?: string
  secret?: string
  trustedOrigins?: string[]
  secureCookies?: boolean
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
    },
    session: {
      modelName: 'authSession',
    },
    trustedOrigins: options.trustedOrigins ?? parseTrustedOrigins(env.AUTH_TRUSTED_ORIGINS),
    advanced: {
      useSecureCookies: options.secureCookies ?? env.NODE_ENV === 'production',
    },
    telemetry: {
      enabled: false,
    },
  })
}

export const auth = createAuth()
