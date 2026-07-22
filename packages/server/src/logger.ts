import pino from 'pino'
import type { DestinationStream } from 'pino'

import { env } from './env.js'
import { loggerRedactPaths, redactSensitive } from './security/redaction.js'

type CreateLoggerOptions = {
  production?: boolean
  destination?: DestinationStream
}

export function createLogger({
  production = env.NODE_ENV === 'production',
  destination,
}: CreateLoggerOptions = {}) {
  return pino(
    {
      level: production ? 'info' : 'debug',
      redact: {
        paths: loggerRedactPaths,
        censor: '[Redacted]',
      },
      hooks: {
        logMethod(args, method) {
          method.apply(
            this,
            args.map((argument) => redactSensitive(argument)) as Parameters<typeof method>,
          )
        },
      },
      transport:
        production || destination
          ? undefined
          : {
              target: 'pino-pretty',
              options: {
                colorize: true,
                translateTime: 'SYS:standard',
                ignore: 'pid,hostname',
              },
            },
      serializers: {
        err(error) {
          return redactSensitive(pino.stdSerializers.err(error))
        },
      },
    },
    destination,
  )
}

export const logger = createLogger()

export type LogContext = {
  requestId?: string
  sessionId?: string
  runId?: string
}
