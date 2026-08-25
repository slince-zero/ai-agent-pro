import { z } from 'zod'

/**
 * 条件项基础 Schema
 * 用于描述各类约束、偏好、排除等条件的单条文本
 * - trim(): 自动去除首尾空白
 * - min(1): 不允许空字符串
 */
const conditionSchema = z.string().trim().min(1).max(200)

/**
 * 检索意图 Schema
 *
 * 对用户自然语言查询进行结构化解析后的结果，
 * 用于指导后续的检索（retrieval）流程。
 *
 * 使用 strictObject 严格模式：禁止出现未定义的额外字段，
 * 避免 LLM 输出多余属性污染数据结构。
 */
export const retrievalIntentSchema = z.strictObject({
  /**
   * 检索目标
   * 用户真正想找的核心对象/主题，例如 "Q3 营收数据"、"登录失败原因"
   */
  target: z.string().trim().min(1).max(300),

  /**
   * 期望的内容类型，可为 null
   * 例如 "表格"、"图表"、"文档"、"代码片段" 等；
   * null 表示用户未指定，由系统自行判断
   */
  contentType: z.string().trim().min(1).nullable(),

  /**
   * 硬约束条件（必须满足）
   * 检索结果必须全部命中这些条件，否则视为不相关
   * 防止 LLM 输出过多导致检索过于狭窄
   */
  hardConstraints: z.array(conditionSchema).max(10),

  /**
   * 排除条件（必须不满足）
   * 命中这些条件的结果应被过滤掉
   *
   */
  exclusions: z.array(conditionSchema).max(10),

  /**
   * 偏好条件（尽量满足，非强制）
   * 用于结果排序或加权，满足越多排名越靠前
   *
   */
  preferences: z.array(conditionSchema).max(10),

  /**
   * 歧义点
   * 查询中存在歧义、需要澄清或系统无法确定的部分
   * 可用于触发追问用户，或在检索时做多路径尝试
   *
   */
  ambiguities: z.array(conditionSchema).max(10),

  /**
   * 目标语言，可为 null
   * 期望检索结果返回的语言；null 表示沿用查询语言或自动判断
   */
  language: z.string().trim().min(1).nullable(),

  /**
   * 时间范围，可为 null
   * 限定检索内容的时间区间，例如 "最近一周"、"2024 年"；
   * null 表示不做时间限制
   */
  timeRange: z.string().trim().min(1).nullable(),
})

/**
 * 检索意图的 TypeScript 类型
 * 由 retrievalIntentSchema 自动推导，保持类型与运行时校验一致
 */
export type RetrievalIntent = z.infer<typeof retrievalIntentSchema>
