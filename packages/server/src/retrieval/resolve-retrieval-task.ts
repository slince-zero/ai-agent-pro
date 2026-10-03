import { z } from 'zod'
import type { ChatMessage, RetrievalTask } from '@ai-agent-pro/shared/type.js'
import { requestDeepSeekIntent, type IntentModelRequest } from './extract-retrieval-intent.js'
import { retrievalIntentSchema } from './retrieval-intent.js'

export const retrievalTaskSchema = z
  .discriminatedUnion('mode', [
    z.strictObject({ mode: z.literal('retrieve'), intent: retrievalIntentSchema }),
    z.strictObject({
      mode: z.literal('clarify'),
      intent: retrievalIntentSchema,
      question: z.string().trim().min(1).max(400),
    }),
    z.strictObject({ mode: z.literal('chat') }),
  ])
  .refine((task) => task.mode !== 'retrieve' || task.intent.ambiguities.length === 0, {
    message: 'Unresolved ambiguities require clarification',
  })

const taskSystemPrompt = `
你负责从对话重建本轮的当前任务，只输出 JSON，不回答问题，不检索。
输入是一份按时间排列的 messages。只有 user 发言能增加、删除、替换条件。
assistant 发言只用于理解“第二篇”“那一个”等指代，不能新增用户约束，也不是事实证据。

先判断最后一条 user 发言：
- 需要查公开来源，或正在修改检索条件：mode 为 retrieve，返回当前完整 intent。
- 目标或重要条件含义不明，无法稳定执行：mode 为 clarify，返回 intent 和一个简短 question。
- 问候、致谢、翻译、结束对话等不需要外部来源的任务：只返回 {"mode":"chat"}。
开始新任务或明确换主题时，清空上一任务的条件；围绕原任务追问时，只修改用户明确改动的项。
新任务不能沿用旧任务的“官方来源”“中文”等要求。版本号和“正式版”属于目标描述，不要凭空新增硬条件。
先区分“查什么”和“结果还必须满足什么”：产品、版本、正式版、发布日期是查询对象及问题本身，写进 target。
只有用户对候选结果或来源提出额外筛选要求时，才写入 hardConstraints；单纯询问某版本正式发布日期没有硬条件。
删除条件必须真的删除；从“最好”改为“必须”时，把它从 preferences 移到 hardConstraints，不能两边都留。
未修改的目标与条件要保留。“那 Koa 3 呢”继承上一轮问的是最低 Node.js 版本，不继承 Express 这个对象。

intent 必须有 target、contentType、hardConstraints、exclusions、preferences、ambiguities、language、timeRange。
“必须”“需要”是 hardConstraints，“排除”“不要”是 exclusions，“最好”“优先”是 preferences。
用户回答澄清问题时，明确的上限或下限是 hardConstraints，例如“希望阅读时间在 20 分钟以内”。
“希望”不把已给出的明确限制降为偏好；只有“最好”“优先”“尽量”等才表示可放宽的偏好。澄清后删除对应 ambiguities。
用户明确要求官方来源也是硬条件。“不要太长”“通俗一点”没有可执行标准时是 ambiguities，要问清标准。
明确要求中文时，可以同时把中文记在 hardConstraints 和 language；“最好中文”只进 preferences，language 为 null。
语言或时间只是偏好时不要把它写进 language/timeRange，否则会变成硬检索限制。
未指定的 contentType、language、timeRange 使用 null，空条件数组使用 []。
不要从助手的回答、搜索结论或自己推测中添加条件。不要输出未定义字段。

retrieve 示例：
{"mode":"retrieve","intent":{"target":"Express 5 入门资料","contentType":"教程","hardConstraints":["官方来源","有可运行代码示例"],"exclusions":["Express 4"],"preferences":["中文"],"ambiguities":[],"language":null,"timeRange":null}}
事实查询示例，user：“开始一个新任务：TypeScript 5.0 正式版是哪年哪月发布的？前面的资料条件不用了。”
{"mode":"retrieve","intent":{"target":"TypeScript 5.0 正式版发布年月","contentType":null,"hardConstraints":[],"exclusions":[],"preferences":[],"ambiguities":[],"language":null,"timeRange":null}}
clarify 示例：
{"mode":"clarify","intent":{"target":"RAG 教程","contentType":"教程","hardConstraints":[],"exclusions":[],"preferences":[],"ambiguities":["不要太长"],"language":null,"timeRange":null},"question":"你说的不要太长，是希望阅读时间在多少分钟以内？"}
`.trim()

/** 明确的新任务指令建立确定的上下文边界，旧条件连同旧助手结论一起离开本轮。 */
export function currentTaskHistory(messages: ChatMessage[]): ChatMessage[] {
  const history = messages.filter((message) => message.role !== 'system')
  const start = history.findLastIndex(
    (message) =>
      message.role === 'user' &&
      /^(?:开始(?:一个|一项)?新任务|新任务[：:]|换个话题[，,:：])/.test(message.content.trim()),
  )
  return start < 0 ? history : history.slice(start)
}

/** 一次模型请求重建当前任务；没有数据库、会话缓存或客户端传回的条件。 */
export async function resolveRetrievalTask(
  messages: ChatMessage[],
  signal: AbortSignal,
  requestModel: IntentModelRequest = requestDeepSeekIntent,
): Promise<RetrievalTask> {
  signal.throwIfAborted()
  const history = currentTaskHistory(messages)
  if (!history.length || history.at(-1)?.role !== 'user' || !history.at(-1)?.content.trim()) {
    throw new Error('Retrieval task needs a final user message')
  }
  const content = await requestModel(
    [
      { role: 'system', content: taskSystemPrompt },
      { role: 'user', content: JSON.stringify({ messages: history }) },
    ],
    signal,
  )
  signal.throwIfAborted()
  if (!content.trim()) throw new Error('Model returned an empty retrieval task')
  return retrievalTaskSchema.parse(JSON.parse(content))
}
