import type { ChatMessage } from '@ai-agent-pro/shared/type.js'
import { createDeepSeekClient } from '../deepseek-client.js'
import { retrievalIntentSchema } from './retrieval-intent.js'
import type { RetrievalIntent } from './retrieval-intent.js'

type IntentModelRequest = (messages: ChatMessage[], signal: AbortSignal) => Promise<string>

const retrievalIntentSystemPrompt = `
你是一个检索意图解析器。请将用户的检索需求转换成 JSON。
不要回答用户的问题，不要输出 Markdown，只输出 JSON。

分类规则：
- “必须”“需要”描述的条件属于 hardConstraints。
- “排除”“不要”描述的条件属于 exclusions。
- “最好”“优先”描述的条件属于 preferences，不要把偏好提升为硬条件。
- 无法稳定执行、含义不明确或需要用户澄清的条件属于 ambiguities。
- 用户未指定 contentType、language 或 timeRange 时，对应字段使用 null。
- 没有内容的条件数组使用空数组，不要增加未定义字段。

输出必须包含 target、contentType、hardConstraints、exclusions、preferences、ambiguities、language、timeRange。

示例 JSON：
{
  "target": "Agent context engineering 教程",
  "contentType": "教程",
  "hardConstraints": ["适合初学者", "包含完整示例"],
  "exclusions": ["只介绍框架用法"],
  "preferences": ["使用 TypeScript"],
  "ambiguities": [],
  "language": "中文",
  "timeRange": null
}
`.trim()

const updateRetrievalIntentSystemPrompt = `
你是一个检索意图更新器。请根据用户的修改指令更新当前检索意图。
不要回答用户的问题，不要输出 Markdown，只输出 JSON。

更新规则：
- 只输出需要修改的字段，没有修改的字段不要输出。
- 增加条件时避免重复。
- 删除条件时输出删除后的完整数组。
- 条件类型发生变化时，同时输出变化前和变化后的完整数组。
- 删除 contentType、language 或 timeRange 的限制时，将对应字段设为 null。
- 不要增加未定义字段。

允许修改的字段只有 target、contentType、hardConstraints、exclusions、preferences、ambiguities、language、timeRange。

示例：当前 hardConstraints 为 ["适合初学者"]、preferences 为 ["使用 TypeScript"]，用户说“TypeScript 必须有”时，输出：
{
  "hardConstraints": ["适合初学者", "使用 TypeScript"],
  "preferences": []
}
`.trim()

const retrievalIntentPatchSchema = retrievalIntentSchema.partial()

async function requestDeepSeekIntent(
  messages: ChatMessage[],
  signal: AbortSignal,
): Promise<string> {
  const response = await createDeepSeekClient().chat.completions.create(
    {
      model: 'deepseek-v4-flash',
      messages,
      stream: false,
      response_format: {
        type: 'json_object',
      },
      max_tokens: 800,
    },
    {
      signal,
    },
  )

  return response.choices[0]?.message.content ?? ''
}

export async function extractRetrievalIntent(
  input: string,
  signal: AbortSignal,
  requestModel: IntentModelRequest = requestDeepSeekIntent,
): Promise<RetrievalIntent> {
  const normalizedInput = input.trim()

  if (!normalizedInput) {
    throw new Error('Retrieval input must not be empty')
  }

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: retrievalIntentSystemPrompt,
    },
    {
      role: 'user',
      content: normalizedInput,
    },
  ]

  const content = await requestModel(messages, signal)
  if (!content.trim()) throw new Error('Model returned an empty retrieval intent')

  const value: unknown = JSON.parse(content)

  return retrievalIntentSchema.parse(value)
}

export async function updateRetrievalIntent(
  currentIntent: RetrievalIntent,
  input: string,
  signal: AbortSignal,
  requestModel: IntentModelRequest = requestDeepSeekIntent,
): Promise<RetrievalIntent> {
  const normalizedInput = input.trim()

  if (!normalizedInput) {
    throw new Error('Retrieval intent update must not be empty')
  }

  const validatedCurrentIntent = retrievalIntentSchema.parse(currentIntent)
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: updateRetrievalIntentSystemPrompt,
    },
    {
      role: 'user',
      content: JSON.stringify({
        currentIntent: validatedCurrentIntent,
        instruction: normalizedInput,
      }),
    },
  ]

  const content = await requestModel(messages, signal)
  if (!content.trim()) throw new Error('Model returned an empty retrieval intent update')

  const value: unknown = JSON.parse(content)
  const patch = retrievalIntentPatchSchema.parse(value)

  return retrievalIntentSchema.parse({
    ...validatedCurrentIntent,
    ...patch,
  })
}
