import type { ChatCompletionTool } from 'openai/resources/index.mjs'
import { readPageTool } from './read-page.js'
import { searchTool } from './search.js'

export const retrievalTools: ChatCompletionTool[] = [searchTool, readPageTool]
