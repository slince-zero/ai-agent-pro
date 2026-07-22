import { createHash } from 'node:crypto'

export type AccountSendRateLimitDecision = {
  allowed: boolean
  retryAfterSeconds: number
}

export interface AccountSendRateLimiter {
  consume(action: string, email: string): AccountSendRateLimitDecision
}

export function createAccountSendRateLimiter(
  options: {
    max?: number
    maxBuckets?: number
    windowSeconds?: number
    now?: () => number
  } = {},
): AccountSendRateLimiter {
  const max = options.max ?? 3
  const maxBuckets = options.maxBuckets ?? 10_000
  const windowSeconds = options.windowSeconds ?? 15 * 60
  const now = options.now ?? Date.now
  const buckets = new Map<string, { count: number; resetAt: number }>()

  return {
    consume(action, email) {
      const currentTime = now()
      const normalizedEmail = email.trim().toLowerCase()
      const accountHash = createHash('sha256').update(normalizedEmail).digest('hex')
      const key = `${action}:${accountHash}`
      const existing = buckets.get(key)

      if (!existing || currentTime >= existing.resetAt) {
        if (!existing && buckets.size >= maxBuckets) {
          for (const [bucketKey, bucket] of buckets) {
            if (currentTime >= bucket.resetAt) buckets.delete(bucketKey)
          }

          if (buckets.size >= maxBuckets) {
            return { allowed: false, retryAfterSeconds: windowSeconds }
          }
        }

        buckets.set(key, {
          count: 1,
          resetAt: currentTime + windowSeconds * 1_000,
        })
        return { allowed: true, retryAfterSeconds: 0 }
      }

      const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - currentTime) / 1_000))
      if (existing.count >= max) {
        return { allowed: false, retryAfterSeconds }
      }

      existing.count += 1
      return { allowed: true, retryAfterSeconds: 0 }
    },
  }
}
