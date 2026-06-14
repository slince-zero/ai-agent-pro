import type { Response } from 'express'

export type ServerEvent =
  | { type: 'text'; text: string }
  | { type: 'tool_call'; toolCallId: string; name: string; args: unknown }
  | { type: 'tool_result'; toolCallId: string; name: string; preview: string }
  | { type: 'usage'; inputTokens: number; outputTokens: number; cost: number }
  | { type: 'done' }
  | { type: 'error'; error: string }

export function prepareSse(res: Response) {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()
}

export function writeSse(res: Response, event: ServerEvent) {
  res.write(`data: ${JSON.stringify(event)}\n\n`)
}
