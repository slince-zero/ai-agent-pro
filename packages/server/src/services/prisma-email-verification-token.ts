import { prisma } from '../db/client.js'
import {
  emailVerificationIdentifierPrefix,
  emailVerificationTokenIdentifier,
  type EmailVerificationTokenStore,
} from './email-verification-token.js'

export const prismaEmailVerificationTokenStore: EmailVerificationTokenStore = {
  async issue(token, userId, expiresInSeconds) {
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1_000)

    await prisma.$transaction(async (transaction) => {
      const lockKey = `${emailVerificationIdentifierPrefix}${userId}`
      await transaction.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`

      await transaction.verification.deleteMany({
        where: {
          identifier: { startsWith: emailVerificationIdentifierPrefix },
          value: userId,
        },
      })
      await transaction.verification.create({
        data: {
          identifier: emailVerificationTokenIdentifier(token),
          value: userId,
          expiresAt,
        },
      })
    })
  },

  async consume(token) {
    const identifier = emailVerificationTokenIdentifier(token)
    const record = await prisma.verification.findFirst({
      where: { identifier },
      select: { id: true, expiresAt: true },
    })

    if (!record) return false

    if (record.expiresAt.getTime() <= Date.now()) {
      await prisma.verification.deleteMany({ where: { id: record.id } })
      return false
    }

    const claimed = await prisma.verification.deleteMany({
      where: {
        id: record.id,
        identifier,
        expiresAt: { gt: new Date() },
      },
    })

    return claimed.count === 1
  },
}
