import { getSystemPrompt } from '../prompts/system.js'
import type { ClientMessage } from '../types/chat.js'
import type { ModelMessage } from './model-client/types.js'

export const DEFAULT_CONTEXT_MAX_MESSAGES = 30
export const DEFAULT_CONTEXT_CHAR_BUDGET = 24_000

const TRUNCATION_PREFIX = '...'

export type ContextBudgetOptions = {
  maxMessages?: number
  maxChars?: number
}

export type ContextInjectionSource = 'summary' | 'memory' | 'retrieval'

export type ContextInjection = {
  source: ContextInjectionSource
  messages: ClientMessage[]
}

export type BuildContextOptions = ContextBudgetOptions & {
  injections?: ContextInjection[]
}

export type ContextBuilderOptions = ContextBudgetOptions & {
  systemPrompt?: string
}

export type ContextMessageSource = {
  loadRecentMessages: (sessionId: string, take: number) => Promise<ClientMessage[]>
}

export type ContextBuilderDeps = {
  source: ContextMessageSource
  options?: ContextBuilderOptions
}

export type ContextBuilder = ReturnType<typeof createContextBuilder>

function toPositiveInteger(value: number | undefined, fallback: number) {
  if (!Number.isFinite(value) || value == null) return fallback

  const normalized = Math.floor(value)
  return normalized > 0 ? normalized : fallback
}

function normalizeBudget(options: ContextBudgetOptions = {}) {
  return {
    maxMessages: toPositiveInteger(options.maxMessages, DEFAULT_CONTEXT_MAX_MESSAGES),
    maxChars: toPositiveInteger(options.maxChars, DEFAULT_CONTEXT_CHAR_BUDGET),
  }
}

function truncateMessageToChars(message: ClientMessage, maxChars: number): ClientMessage | null {
  if (maxChars <= 0) return null
  if (message.content.length <= maxChars) return message

  if (maxChars <= TRUNCATION_PREFIX.length) {
    return {
      ...message,
      content: message.content.slice(-maxChars),
    }
  }

  return {
    ...message,
    content: `${TRUNCATION_PREFIX}${message.content.slice(-(maxChars - TRUNCATION_PREFIX.length))}`,
  }
}

function flattenInjections(injections: ContextInjection[] | undefined) {
  return injections?.flatMap((injection) => injection.messages) ?? []
}

export function selectContextMessages(
  messages: ClientMessage[],
  options: ContextBudgetOptions = {},
): ClientMessage[] {
  const { maxMessages, maxChars } = normalizeBudget(options)
  const recentMessages = messages.slice(-maxMessages)
  const selected: ClientMessage[] = []
  let remainingChars = maxChars

  for (let index = recentMessages.length - 1; index >= 0; index -= 1) {
    const message = recentMessages[index]
    if (!message) continue

    if (message.content.length <= remainingChars) {
      selected.unshift(message)
      remainingChars -= message.content.length
      continue
    }

    if (selected.length === 0) {
      const truncated = truncateMessageToChars(message, remainingChars)
      if (truncated) selected.unshift(truncated)
    }
    break
  }

  return selected
}

export function buildContextMessages(
  recentMessages: ClientMessage[],
  options: BuildContextOptions = {},
) {
  return selectContextMessages(
    [...flattenInjections(options.injections), ...recentMessages],
    options,
  )
}

export function buildAgentConversation(
  messages: ClientMessage[],
  systemPrompt = getSystemPrompt(),
): ModelMessage[] {
  return [
    { role: 'system', content: systemPrompt },
    ...messages.map<ModelMessage>((message) =>
      message.role === 'user'
        ? { role: 'user', content: message.content }
        : { role: 'assistant', content: message.content },
    ),
  ]
}

export function createContextBuilder({ source, options = {} }: ContextBuilderDeps) {
  const buildClientMessages = async (sessionId: string, buildOptions: BuildContextOptions = {}) => {
    const budget = normalizeBudget({ ...options, ...buildOptions })
    const recentMessages = await source.loadRecentMessages(sessionId, budget.maxMessages)

    return buildContextMessages(recentMessages, {
      ...budget,
      injections: buildOptions.injections,
    })
  }

  return {
    buildClientMessages,
    async buildConversation(sessionId: string, buildOptions: BuildContextOptions = {}) {
      const messages = await buildClientMessages(sessionId, buildOptions)
      return buildAgentConversation(messages, options.systemPrompt)
    },
  }
}
