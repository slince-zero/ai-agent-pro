import { readFile } from 'node:fs/promises'
import { z } from 'zod'
import { retrievalIntentSchema } from '../retrieval/retrieval-intent.js'

/**
 * 一个期望片段：字符串，或者几种可接受的说法。
 *
 * 模型不会逐字复述用户的话——"有完整示例"可能被写成"包含完整代码示例"。
 * 所以期望写成"出现其中任意一个片段即可"，比较时忽略大小写和空白。
 * 片段要挑最不可能被改写的那个词，而不是整句。
 */
export const matchSchema = z.union([
  z.string().trim().min(1),
  z.array(z.string().trim().min(1)).min(1),
])

export type Match = z.infer<typeof matchSchema>

/** 对一个条件数组的期望 */
const listExpectSchema = z.strictObject({
  /** 每一项都要被数组里的某一条命中 */
  has: z.array(matchSchema).optional(),
  /** 数组里任何一条都不能命中这些——用来抓"偏好被升级成硬条件"这类错位 */
  lacks: z.array(matchSchema).optional(),
  /** true：必须为空；false：必须非空 */
  empty: z.boolean().optional(),
})

/** null 表示字段必须是 null；给片段表示必须非 null 且命中；不写这个键表示不检查 */
const scalarExpectSchema = matchSchema.nullable().optional()

export const intentExpectSchema = z.strictObject({
  target: matchSchema.optional(),
  contentType: scalarExpectSchema,
  language: scalarExpectSchema,
  timeRange: scalarExpectSchema,
  hardConstraints: listExpectSchema.optional(),
  exclusions: listExpectSchema.optional(),
  preferences: listExpectSchema.optional(),
  ambiguities: listExpectSchema.optional(),
})

export type IntentExpect = z.infer<typeof intentExpectSchema>

const caseMetaSchema = {
  id: z.string().regex(/^[a-z0-9-]+$/, 'id 只用小写字母、数字和连字符'),
  /** 这条用例在测什么。写不出来，说明这条用例不该存在 */
  why: z.string().trim().min(1),
  tags: z.array(z.string()).default([]),
}

export const intentCaseSchema = z.strictObject({
  ...caseMetaSchema,
  input: z.string().trim().min(1),
  expect: intentExpectSchema,
})

export const intentUpdateCaseSchema = z.strictObject({
  ...caseMetaSchema,
  current: retrievalIntentSchema,
  instruction: z.string().trim().min(1),
  expect: intentExpectSchema,
  /** 这些字段必须和 current 完全一样：条件更新不能悄悄改掉无关的部分 */
  unchanged: z.array(retrievalIntentSchema.keyof()).default([]),
})

const agentExpectSchema = z.strictObject({
  tools: z.enum(['none', 'required']).optional(),
  readPage: z.boolean().optional(),
  checklist: z.boolean().optional(),
  answerHas: z.array(matchSchema).optional(),
  answerLacks: z.array(matchSchema).optional(),
  mode: z.enum(['retrieve', 'clarify', 'chat']).optional(),
  intent: intentExpectSchema.optional(),
})

export const agentCaseSchema = z.strictObject({
  ...caseMetaSchema,
  messages: z
    .array(
      z.strictObject({
        role: z.enum(['user', 'assistant']),
        content: z.string().trim().min(1),
      }),
    )
    .min(1)
    .refine((messages) => messages.at(-1)?.role === 'user', '最后一条必须是 user'),
  expect: agentExpectSchema,
  /** 真实上一轮回答会进入下一轮历史，不能用手写答案代替闭环。 */
  followUps: z
    .array(z.strictObject({ input: z.string().trim().min(1), expect: agentExpectSchema }))
    .optional(),
})

export type IntentCase = z.infer<typeof intentCaseSchema>
export type IntentUpdateCase = z.infer<typeof intentUpdateCaseSchema>
export type AgentCase = z.infer<typeof agentCaseSchema>

export const suites = {
  intent: intentCaseSchema,
  'intent-update': intentUpdateCaseSchema,
  agent: agentCaseSchema,
} as const

export type SuiteName = keyof typeof suites

export function isSuiteName(value: string): value is SuiteName {
  return Object.hasOwn(suites, value)
}

/**
 * 读一个用例集并整体校验。
 *
 * id 重复直接报错：报告按 id 汇总，重复的 id 会把两条用例的结果混成一条。
 */
export async function loadSuite<Name extends SuiteName>(
  name: Name,
): Promise<z.infer<(typeof suites)[Name]>[]> {
  const file = new URL(`./cases/${name}.json`, import.meta.url)
  const raw: unknown = JSON.parse(await readFile(file, 'utf8'))
  const cases = z.array(suites[name]).parse(raw) as z.infer<(typeof suites)[Name]>[]
  const seen = new Set<string>()

  for (const item of cases) {
    if (seen.has(item.id)) throw new Error(`Duplicate case id in ${name}: ${item.id}`)
    seen.add(item.id)
  }

  return cases
}
