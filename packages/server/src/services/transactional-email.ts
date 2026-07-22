export type TransactionalEmail = {
  to: string
  subject: string
  text: string
  html: string
  idempotencyKey: string
}

export interface TransactionalEmailSender {
  send(message: TransactionalEmail): Promise<void>
}

type EmailLogger = {
  info(data: Record<string, unknown>, message: string): void
}

export function createConsoleEmailSender(log: EmailLogger): TransactionalEmailSender {
  return {
    async send(message) {
      log.info(
        {
          email: {
            to: message.to,
            subject: message.subject,
            text: message.text,
          },
        },
        'development email captured',
      )
    },
  }
}

export function createResendEmailSender(options: {
  apiKey: string
  from: string
  fetch?: typeof fetch
}): TransactionalEmailSender {
  const request = options.fetch ?? fetch

  return {
    async send(message) {
      const response = await request('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': message.idempotencyKey,
        },
        body: JSON.stringify({
          from: options.from,
          to: [message.to],
          subject: message.subject,
          text: message.text,
          html: message.html,
        }),
        signal: AbortSignal.timeout(10_000),
      })

      if (!response.ok) {
        throw new Error(`Transactional email provider rejected request (${response.status})`)
      }
    },
  }
}
