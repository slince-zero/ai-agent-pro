import { z } from 'zod'
import type { ChatCompletionTool } from 'openai/resources/index.mjs'
import { agentLimits } from '../agent-limits.js'
import { ToolConfigurationError, ToolProviderHttpError } from './tool-errors.js'

const TAVILY_EXTRACT_URL = 'https://api.tavily.com/extract'
const EXTRACT_TIMEOUT_SECONDS = 10
const REQUEST_TIMEOUT_MS = 12_000

export const readPageInputSchema = z.strictObject({
  url: z
    .string()
    .url()
    .refine(
      (value) =>
        URL.canParse(value) && ['http:', 'https:'].includes(new URL(value).protocol),
      {
        message: 'url 必须使用 http 或 https 协议',
      },
    ),
})

export type ReadPageInput = z.infer<typeof readPageInputSchema>

export type ReadPageResult = {
  url: string
  content: string
  truncated: boolean
}

const tavilyExtractResponseSchema = z.object({
  results: z.array(
    z.object({
      url: z.string().url(),
      raw_content: z.string(),
    }),
  ),
  failed_results: z
    .array(
      z.object({
        url: z.string(),
        error: z.string().optional(),
      }),
    )
    .optional(),
})

type ExtractRequest = (input: string | URL, init?: RequestInit) => Promise<Response>

type ReadPageDependencies = {
  apiKey?: string
  request?: ExtractRequest
}

export const readPageTool = {
  type: 'function',
  function: {
    name: 'read_page',
    description:
      'Read the content of a public web page when search snippets are insufficient to verify a requirement.',
    parameters: z.toJSONSchema(readPageInputSchema),
  },
} satisfies ChatCompletionTool

export async function readPage(
  input: ReadPageInput,
  signal: AbortSignal,
  dependencies: ReadPageDependencies = {},
): Promise<ReadPageResult> {
  signal.throwIfAborted()

  const apiKey = dependencies.apiKey ?? process.env.TAVILY_API_KEY
  const request = dependencies.request ?? fetch

  if (!apiKey) {
    throw new ToolConfigurationError('TAVILY_API_KEY is not configured')
  }

  const response = await request(TAVILY_EXTRACT_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      urls: [input.url],
      extract_depth: 'basic',
      format: 'markdown',
      include_images: false,
      timeout: EXTRACT_TIMEOUT_SECONDS,
    }),
    signal: AbortSignal.any([signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]),
  })

  if (!response.ok) {
    throw new ToolProviderHttpError('Tavily extract failed', response.status)
  }

  let body: unknown

  try {
    body = await response.json()
  } catch {
    throw new Error('Tavily returned invalid JSON')
  }

  const parsed = tavilyExtractResponseSchema.parse(body)
  const result = parsed.results[0]

  if (!result) {
    const failureMessage = parsed.failed_results?.[0]?.error
    throw new Error(failureMessage ?? 'Tavily returned no extracted page')
  }

  const content = result.raw_content.trim()

  if (!content) {
    throw new Error('Tavily returned empty page content')
  }

  return {
    url: result.url,
    content: content.slice(0, agentLimits.maxPageContentLength),
    truncated: content.length > agentLimits.maxPageContentLength,
  }
}
