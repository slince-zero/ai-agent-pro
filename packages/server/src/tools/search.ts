import { z } from 'zod'
import type { ChatCompletionTool } from 'openai/resources/index.mjs'
import { ToolConfigurationError, ToolProviderHttpError } from './tool-errors.js'

const TAVILY_SEARCH_URL = 'https://api.tavily.com/search'
const SEARCH_TIMEOUT_MS = 8_000

export const searchInputSchema = z.strictObject({
  query: z.string().trim().min(1, 'query 不能为空').max(200, 'query 不能超过200个字符'),
})

export type SearchInput = z.infer<typeof searchInputSchema>

export type SearchResult = {
  title: string
  url: string
  snippet: string
}

const tavilyResponseSchema = z.object({
  results: z.array(
    z.object({
      title: z.string().trim().min(1),
      url: z.string().url(),
      content: z.string(),
    }),
  ),
})

type SearchRequest = (input: string | URL, init?: RequestInit) => Promise<Response>

type SearchDependencies = {
  apiKey?: string
  request?: SearchRequest
}

export const searchTool = {
  type: 'function',
  function: {
    name: 'search',
    description:
      'Search public web pages when the user asks for articles, tutorials, sources, or current information.',
    parameters: z.toJSONSchema(searchInputSchema),
  },
} satisfies ChatCompletionTool

export async function search(
  input: SearchInput,
  signal: AbortSignal,
  dependencies: SearchDependencies = {},
): Promise<SearchResult[]> {
  signal.throwIfAborted()

  const apiKey = dependencies.apiKey ?? process.env.TAVILY_API_KEY
  const request = dependencies.request ?? fetch

  if (!apiKey) {
    throw new ToolConfigurationError('TAVILY_API_KEY is not configured')
  }

  const response = await request(TAVILY_SEARCH_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: input.query,
      topic: 'general',
      search_depth: 'basic',
      max_results: 5,
      include_answer: false,
      include_raw_content: false,
      include_images: false,
    }),
    signal: AbortSignal.any([signal, AbortSignal.timeout(SEARCH_TIMEOUT_MS)]),
  })

  if (!response.ok) {
    throw new ToolProviderHttpError('Tavily search failed', response.status)
  }

  let body: unknown

  try {
    body = await response.json()
  } catch {
    throw new Error('Tavily returned invalid JSON')
  }

  const parsed = tavilyResponseSchema.parse(body)

  return parsed.results.map((result) => ({
    title: result.title,
    url: result.url,
    snippet: result.content,
  }))
}
