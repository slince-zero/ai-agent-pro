import { getSystemPrompt } from '../prompts/system.js'
import type { ClientMessage } from '../types/chat.js'
import type { ModelMessage } from './model-client/types.js'

export const DEFAULT_CONTEXT_MAX_MESSAGES = 30
export const DEFAULT_CONTEXT_CHAR_BUDGET = 24_000

const TRUNCATION_PREFIX = '...'
const SUMMARY_CONTEXT_PREFIX = 'Session summary:'
const MEMORY_CONTEXT_PREFIX = 'Relevant memory:'
const RETRIEVAL_CONTEXT_PREFIX = 'Relevant documents:'

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

export type ContextBuildInput = {
  sessionId: string
  userId?: string
  projectId?: string
  query?: string
  signal?: AbortSignal
}

export type RetrievalContextItem = {
  content: string
  metadata?: unknown
  score?: number | null
  sourceRef?: string | null
  title?: string | null
  uri?: string | null
}

export type ContextMessageSource = {
  loadRecentMessages: (sessionId: string, take: number) => Promise<ClientMessage[]>
  loadSessionSummary?: (input: ContextBuildInput) => Promise<string | null>
  loadRelevantMemories?: (input: ContextBuildInput) => Promise<string[]>
  loadRelevantDocuments?: (input: ContextBuildInput) => Promise<RetrievalContextItem[]>
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

function toContextBuildInput(input: string | ContextBuildInput): ContextBuildInput {
  return typeof input === 'string' ? { sessionId: input } : input
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

export function formatSummaryForContext(content: string): ClientMessage {
  return {
    role: 'assistant',
    content: `${SUMMARY_CONTEXT_PREFIX}\n${content}`,
  }
}

export function formatMemoriesForContext(memories: string[]): ClientMessage | null {
  const normalizedMemories = memories
    .map((memory) => memory.replace(/\s+/g, ' ').trim())
    .filter(Boolean)

  if (normalizedMemories.length === 0) return null

  return {
    role: 'assistant',
    content: `${MEMORY_CONTEXT_PREFIX}\n${normalizedMemories.map((memory) => `- ${memory}`).join('\n')}`,
  }
}

function formatRetrievalSource(item: RetrievalContextItem, index: number) {
  const title = item.title?.trim() || `Document ${index + 1}`
  const location = item.sourceRef?.trim()
  const uri = item.uri?.trim()
  const parts = [`[${index + 1}] ${title}`]
  if (location) parts.push(location)
  if (uri) parts.push(uri)
  return parts.join(' - ')
}

export function formatRetrievalForContext(items: RetrievalContextItem[]): ClientMessage | null {
  const normalizedItems = items
    .map((item) => ({
      ...item,
      content: item.content.replace(/\s+/g, ' ').trim(),
    }))
    .filter((item) => item.content)

  if (normalizedItems.length === 0) return null

  return {
    role: 'assistant',
    content: `${RETRIEVAL_CONTEXT_PREFIX}\n${normalizedItems
      .map((item, index) => `${formatRetrievalSource(item, index)}\n${item.content}`)
      .join('\n\n')}`,
  }
}

function selectRecentMessages(messages: ClientMessage[], maxMessages: number, maxChars: number) {
  if (maxMessages <= 0 || maxChars <= 0) return []

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

function selectPrefixMessages(messages: ClientMessage[], maxMessages: number, maxChars: number) {
  const selected: ClientMessage[] = []
  let remainingChars = maxChars

  if (maxMessages <= 0 || maxChars <= 0) {
    return { messages: selected, remainingMessages: maxMessages, remainingChars }
  }

  for (const message of messages.slice(0, maxMessages)) {
    const selectedMessage = truncateMessageToChars(message, remainingChars)
    if (!selectedMessage) break

    selected.push(selectedMessage)
    remainingChars -= selectedMessage.content.length
  }

  return {
    messages: selected,
    remainingMessages: maxMessages - selected.length,
    remainingChars,
  }
}

export function selectContextMessages(
  messages: ClientMessage[],
  options: ContextBudgetOptions = {},
): ClientMessage[] {
  const { maxMessages, maxChars } = normalizeBudget(options)
  return selectRecentMessages(messages, maxMessages, maxChars)
}

export function buildContextMessages(
  recentMessages: ClientMessage[],
  options: BuildContextOptions = {},
) {
  const { maxMessages, maxChars } = normalizeBudget(options)
  const injected = selectPrefixMessages(
    flattenInjections(options.injections),
    maxMessages,
    maxChars,
  )
  const selectedRecentMessages = selectRecentMessages(
    recentMessages,
    injected.remainingMessages,
    injected.remainingChars,
  )

  return [...injected.messages, ...selectedRecentMessages]
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
  const buildClientMessages = async (
    input: string | ContextBuildInput,
    buildOptions: BuildContextOptions = {},
  ) => {
    const contextInput = toContextBuildInput(input)
    const budget = normalizeBudget({ ...options, ...buildOptions })
    const [summary, memories, documents, recentMessages] = await Promise.all([
      source.loadSessionSummary?.(contextInput) ?? Promise.resolve(null),
      source.loadRelevantMemories?.(contextInput) ?? Promise.resolve([]),
      source.loadRelevantDocuments?.(contextInput) ?? Promise.resolve([]),
      source.loadRecentMessages(contextInput.sessionId, budget.maxMessages),
    ])
    const memoryMessage = formatMemoriesForContext(memories)
    const retrievalMessage = formatRetrievalForContext(documents)
    const sourceInjections: ContextInjection[] = summary
      ? [
          {
            source: 'summary',
            messages: [formatSummaryForContext(summary)],
          },
        ]
      : []
    if (memoryMessage) {
      sourceInjections.push({
        source: 'memory',
        messages: [memoryMessage],
      })
    }
    if (retrievalMessage) {
      sourceInjections.push({
        source: 'retrieval',
        messages: [retrievalMessage],
      })
    }

    return buildContextMessages(recentMessages, {
      ...budget,
      injections: [...sourceInjections, ...(buildOptions.injections ?? [])],
    })
  }

  return {
    buildClientMessages,
    async buildConversation(
      input: string | ContextBuildInput,
      buildOptions: BuildContextOptions = {},
    ) {
      const messages = await buildClientMessages(input, buildOptions)
      return buildAgentConversation(messages, options.systemPrompt)
    },
  }
}
