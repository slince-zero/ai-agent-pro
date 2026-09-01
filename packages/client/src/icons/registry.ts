import type { ComponentType } from 'react'
import type { IconProps } from './Icon'
import { ContextAvatar, ContextMark, ContextPulse } from './brand'
import {
  AccountIcon,
  AttachIcon,
  CopyIcon,
  DisclosureIcon,
  HistoryIcon,
  NewChatIcon,
  SendIcon,
  StopIcon,
} from './ui'
import {
  ConfirmedIcon,
  EmptyIcon,
  ReasoningIcon,
  SparkIcon,
  ThinkingIcon,
  TokensIcon,
  UnknownIcon,
  UnmetIcon,
} from './state'
import { ClarifyIcon, ExcludeIcon, IntentIcon, MustIcon, PreferIcon } from './intent'
import { CandidatesIcon, FilterIcon, QueryIcon, ReadPageIcon, SearchWebIcon } from './pipeline'
import {
  AgentLoopIcon,
  BudgetIcon,
  EvidenceIcon,
  RerankIcon,
  SourceIcon,
  ToolIcon,
} from './evidence'

export const iconGroups = {
  brand: '品牌标记',
  ui: '界面控件',
  state: '运行状态',
  intent: '检索意图',
  pipeline: '检索链路',
  evidence: '证据与循环',
} as const

export type IconGroupKey = keyof typeof iconGroups

export type IconEntry = {
  name: string
  label: string
  group: IconGroupKey
  /** 这个图标服务于哪个已有或计划中的能力 */
  usage: string
  Icon: ComponentType<IconProps>
}

/**
 * 图标清单。前三组服务当前界面，后三组对应 docs/product-plan.md
 * 里阶段 2 到阶段 6 的能力，实现这些能力时可以直接取用。
 */
export const iconRegistry: IconEntry[] = [
  { name: 'mark', label: '品牌标记', group: 'brand', Icon: ContextMark, usage: '导航栏、favicon' },
  { name: 'pulse', label: '检索脉冲', group: 'brand', Icon: ContextPulse, usage: '全局加载态' },
  { name: 'avatar', label: '助手头像', group: 'brand', Icon: ContextAvatar, usage: '消息流头像' },

  { name: 'send', label: '发送', group: 'ui', Icon: SendIcon, usage: '输入框发送按钮' },
  { name: 'stop', label: '停止生成', group: 'ui', Icon: StopIcon, usage: '流式输出中断' },
  { name: 'attach', label: '附加文件', group: 'ui', Icon: AttachIcon, usage: '输入框附件' },
  { name: 'newChat', label: '新对话', group: 'ui', Icon: NewChatIcon, usage: '开启新检索任务' },
  { name: 'history', label: '历史记录', group: 'ui', Icon: HistoryIcon, usage: '往期会话' },
  { name: 'account', label: '账户', group: 'ui', Icon: AccountIcon, usage: '导航栏账户入口' },
  { name: 'copy', label: '复制', group: 'ui', Icon: CopyIcon, usage: '复制回答或来源链接' },
  {
    name: 'disclosure',
    label: '折叠展开',
    group: 'ui',
    Icon: DisclosureIcon,
    usage: '检索过程、思维链的收起与展开',
  },

  { name: 'spark', label: 'AI 回答', group: 'state', Icon: SparkIcon, usage: '模型生成的内容' },
  { name: 'thinking', label: '思考中', group: 'state', Icon: ThinkingIcon, usage: '等待首字节' },
  {
    name: 'reasoning',
    label: '思维链',
    group: 'state',
    Icon: ReasoningIcon,
    usage: '每轮的 reasoning_content',
  },
  { name: 'tokens', label: 'Token 用量', group: 'state', Icon: TokensIcon, usage: '用量展示' },
  { name: 'confirmed', label: '已确认', group: 'state', Icon: ConfirmedIcon, usage: '条件已满足' },
  { name: 'unmet', label: '不满足', group: 'state', Icon: UnmetIcon, usage: '条件不满足' },
  { name: 'unknown', label: '无法确认', group: 'state', Icon: UnknownIcon, usage: '证据不足' },
  { name: 'empty', label: '无合格结果', group: 'state', Icon: EmptyIcon, usage: '诚实停止' },

  { name: 'intent', label: '检索目标', group: 'intent', Icon: IntentIcon, usage: '阶段 2 意图' },
  { name: 'must', label: '硬条件', group: 'intent', Icon: MustIcon, usage: '必须满足的约束' },
  { name: 'exclude', label: '排除条件', group: 'intent', Icon: ExcludeIcon, usage: '命中即淘汰' },
  { name: 'prefer', label: '软偏好', group: 'intent', Icon: PreferIcon, usage: '只影响排序' },
  { name: 'clarify', label: '澄清问题', group: 'intent', Icon: ClarifyIcon, usage: '模糊条件反问' },

  { name: 'query', label: '生成查询', group: 'pipeline', Icon: QueryIcon, usage: '阶段 3 查询' },
  {
    name: 'searchWeb',
    label: '搜索网页',
    group: 'pipeline',
    Icon: SearchWebIcon,
    usage: '搜索工具',
  },
  { name: 'readPage', label: '读取页面', group: 'pipeline', Icon: ReadPageIcon, usage: '正文提取' },
  {
    name: 'candidates',
    label: '候选结果',
    group: 'pipeline',
    Icon: CandidatesIcon,
    usage: '候选集',
  },
  { name: 'filter', label: '确定性过滤', group: 'pipeline', Icon: FilterIcon, usage: '硬条件过滤' },

  { name: 'evidence', label: '来源证据', group: 'evidence', Icon: EvidenceIcon, usage: '证据片段' },
  { name: 'rerank', label: '语义重排', group: 'evidence', Icon: RerankIcon, usage: '阶段 4 重排' },
  {
    name: 'budget',
    label: '上下文预算',
    group: 'evidence',
    Icon: BudgetIcon,
    usage: '阶段 5 预算',
  },
  {
    name: 'agentLoop',
    label: 'Agent 循环',
    group: 'evidence',
    Icon: AgentLoopIcon,
    usage: '阶段 6',
  },
  { name: 'source', label: '来源链接', group: 'evidence', Icon: SourceIcon, usage: '结果溯源' },
  { name: 'tool', label: '工具调用', group: 'evidence', Icon: ToolIcon, usage: '工具往返' },
]
