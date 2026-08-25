import { z } from 'zod'
import type { ChatCompletionTool } from 'openai/resources/index.mjs'

export const searchInputSchema = z.strictObject({
  query: z.string().trim().min(1, 'query 不能为空').max(200, 'query 不能超过200个字符'),
})

export type SearchInput = z.infer<typeof searchInputSchema>

export type SearchResult = {
  title: string
  url: string
  snippet: string
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

export async function search(input: SearchInput, signal: AbortSignal): Promise<SearchResult[]> {
  signal.throwIfAborted()

  return [
    {
      title: `${input.query} 入门教程`,
      url: 'https://example.com/tutorial',
      snippet: `这是一条关于“${input.query}”的模拟搜索结果。`,
    },
  ]
}
