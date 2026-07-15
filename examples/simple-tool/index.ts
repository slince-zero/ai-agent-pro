import { definePlugin, defineTool } from '@ai-agent-pro/tool-sdk'
import { z } from 'zod'

export const wordCountTool = defineTool({
  name: 'word_count',
  description: 'Counts words and characters in a text value.',
  governance: {
    category: 'code',
    sideEffect: false,
    requiresAuth: false,
    timeoutMs: 1_000,
  },
  schema: z.object({
    text: z.string().min(1).describe('Text to inspect.'),
  }),
  run: ({ text }, { signal }) => {
    signal.throwIfAborted()
    return JSON.stringify({
      words: text.trim().split(/\s+/).length,
      characters: text.length,
    })
  },
})

export const simpleToolPlugin = definePlugin({
  name: 'simple-tool',
  version: '0.1.0',
  tools: [wordCountTool],
})
