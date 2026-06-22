import type { Response } from 'express'

type ServerEventMeta = {
  eventId?: string
}

export type ServerEvent = ServerEventMeta &
  (
    | { type: 'run_id'; runId: string }
    | { type: 'text'; text: string }
    | { type: 'tool_call'; toolCallId: string; name: string; args: unknown }
    | {
        type: 'tool_result'
        toolCallId: string
        name: string
        preview: string
        status?: 'completed' | 'failed'
        durationMs?: number
        error?: string
      }
    | { type: 'usage'; inputTokens: number; outputTokens: number; cost: number }
    | { type: 'done' }
    | { type: 'error'; error: string }
  )

type WriteSseOptions = {
  eventId?: string
}

type SseWriterOptions = {
  eventIdPrefix?: string
}

const DEFAULT_HEARTBEAT_INTERVAL_MS = 15_000

export function prepareSse(res: Response) {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()
}

function sseField(name: string, value: string) {
  return `${name}: ${value.replace(/[\r\n]/g, ' ')}\n`
}

export function writeSse(res: Response, event: ServerEvent, options: WriteSseOptions = {}) {
  const payload = options.eventId ? { ...event, eventId: options.eventId } : event
  let frame = ''

  if (options.eventId) {
    frame += sseField('id', options.eventId)
  }
  frame += sseField('event', event.type)
  frame += `data: ${JSON.stringify(payload)}\n\n`
  res.write(frame)
}

export function writeSseHeartbeat(res: Response) {
  res.write(`: heartbeat ${new Date().toISOString()}\n\n`)
}

export function createSseWriter(res: Response, options: SseWriterOptions = {}) {
  let sequence = 0
  let eventIdPrefix = options.eventIdPrefix ?? 'stream'

  return {
    write(event: ServerEvent) {
      if (event.type === 'run_id') {
        eventIdPrefix = event.runId
      }

      sequence += 1
      writeSse(res, event, {
        eventId: `${eventIdPrefix}:${sequence}`,
      })
    },
    heartbeat() {
      writeSseHeartbeat(res)
    },
  }
}

export function startSseHeartbeat(res: Response, intervalMs = DEFAULT_HEARTBEAT_INTERVAL_MS) {
  const interval = setInterval(() => {
    if (!res.writableEnded) {
      writeSseHeartbeat(res)
    }
  }, intervalMs)

  return () => clearInterval(interval)
}
