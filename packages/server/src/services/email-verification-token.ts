import { createHash } from 'node:crypto'

const IDENTIFIER_PREFIX = 'email-verification:'

export interface EmailVerificationTokenStore {
  issue(token: string, userId: string, expiresInSeconds: number): Promise<void>
  consume(token: string): Promise<boolean>
}

function identifierFor(token: string) {
  return `${IDENTIFIER_PREFIX}${createHash('sha256').update(token).digest('hex')}`
}

export function createMemoryEmailVerificationTokenStore(
  now: () => number = Date.now,
): EmailVerificationTokenStore {
  const records = new Map<string, { userId: string; expiresAt: number }>()

  return {
    async issue(token, userId, expiresInSeconds) {
      for (const [identifier, record] of records) {
        if (record.userId === userId) records.delete(identifier)
      }

      records.set(identifierFor(token), {
        userId,
        expiresAt: now() + expiresInSeconds * 1_000,
      })
    },

    async consume(token) {
      const identifier = identifierFor(token)
      const record = records.get(identifier)
      if (!record) return false

      records.delete(identifier)
      return record.expiresAt > now()
    },
  }
}

export function emailVerificationTokenIdentifier(token: string) {
  return identifierFor(token)
}

export const emailVerificationIdentifierPrefix = IDENTIFIER_PREFIX
