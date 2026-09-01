import type { EvidenceSource, MessageStreamEvent, TokenUsage } from '@ai-agent-pro/shared/type.js'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** 域名去掉 www.，一行里就能放下更多有用的信息 */
export function readHost(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/**
 * 按域名散出一个色相：同一个站在整条时间轴上永远是同一个颜色，扫一眼就能看出重复来源。
 *
 * 不拉第三方 favicon 服务：那等于把"用户看了哪些来源"顺手送给图标服务商。
 */
export function readHostHue(host: string) {
  let hash = 0

  for (const char of host) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) % 360

  return hash
}

/**
 * 来源要连着 ref 一起验。
 *
 * ref 是答案里那个 [1] 唯一的落点：少了它，行内引用就会指到一个不存在的来源上，
 * 而这种错在界面上表现为"点了没反应"，比直接拒掉这条事件更难查。
 */
function isEvidenceSource(value: unknown): value is EvidenceSource {
  return (
    isRecord(value) &&
    typeof value.ref === 'number' &&
    typeof value.url === 'string' &&
    typeof value.title === 'string' &&
    typeof value.snippet === 'string' &&
    typeof value.read === 'boolean'
  )
}

function isTokenUsage(value: unknown): value is TokenUsage {
  return (
    isRecord(value) &&
    typeof value.inputTokens === 'number' &&
    typeof value.outputTokens === 'number' &&
    typeof value.totalTokens === 'number'
  )
}

function isMessageStreamEvent(value: unknown): value is MessageStreamEvent {
  if (!isRecord(value)) return false

  switch (value.type) {
    case 'text_delta':
      return typeof value.delta === 'string'
    case 'reasoning_delta':
      return typeof value.delta === 'string'
    case 'usage':
      return isTokenUsage(value.usage)
    case 'round_start':
      return typeof value.round === 'number'
    case 'tool_call':
      return (
        typeof value.id === 'string' &&
        typeof value.name === 'string' &&
        typeof value.arguments === 'string'
      )
    case 'tool_result':
      return (
        typeof value.id === 'string' &&
        typeof value.name === 'string' &&
        typeof value.ok === 'boolean' &&
        (value.preview === undefined || typeof value.preview === 'string')
      )
    case 'evidence':
      return Array.isArray(value.sources) && value.sources.every(isEvidenceSource)
    case 'done':
      return true
    case 'error':
      return typeof value.message === 'string'
    default:
      return false
  }
}

function emitEvent(line: string, onEvent: (event: MessageStreamEvent) => void) {
  if (!line.trim()) return

  const event: unknown = JSON.parse(line)
  if (!isMessageStreamEvent(event)) {
    throw new Error('Received an invalid stream event')
  }

  onEvent(event)
}

export async function consumeNDJSON(
  response: Response,
  onEvent: (event: MessageStreamEvent) => void,
): Promise<void> {
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`)
  }

  if (!response.body) {
    throw new Error('Streaming response body is unavailable')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { value, done } = await reader.read()

    if (done) {
      buffer += decoder.decode()
      break
    }

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      emitEvent(line, onEvent)
    }
  }

  emitEvent(buffer, onEvent)
}
