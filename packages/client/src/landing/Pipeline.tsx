import type { ComponentType } from 'react'
import {
  AgentLoopIcon,
  BudgetIcon,
  CandidatesIcon,
  ClarifyIcon,
  ConfirmedIcon,
  EvidenceIcon,
  ExcludeIcon,
  FilterIcon,
  IntentIcon,
  MustIcon,
  PreferIcon,
  QueryIcon,
  ReadPageIcon,
  RerankIcon,
  SearchWebIcon,
  SourceIcon,
  UnknownIcon,
  UnmetIcon,
} from '../icons'
import type { IconProps } from '../icons'
import { Reveal } from './Reveal'
import { Eyebrow, SectionHeading, iconChip, sectionShell } from './ui'

type Step = {
  Icon: ComponentType<IconProps>
  title: string
  status: string
  body: string
  tags: { Icon: ComponentType<IconProps>; label: string }[]
}

/** 展示目标链路，并标明当前实现边界。 */
const steps: Step[] = [
  {
    Icon: IntentIcon,
    title: '解析检索意图',
    status: '多轮与澄清已接入',
    body: '每轮从当前任务的对话重建目标、硬条件、排除项与软偏好，增删条件只修改用户指定的项。模糊标准先询问，再检索。',
    tags: [
      { Icon: MustIcon, label: '硬条件' },
      { Icon: ExcludeIcon, label: '排除项' },
      { Icon: PreferIcon, label: '软偏好' },
      { Icon: ClarifyIcon, label: '待澄清' },
    ],
  },
  {
    Icon: SearchWebIcon,
    title: '检索并读取来源',
    status: '工具已接入',
    body: '通过有预算的搜索和页面读取工具获得来源，记录标题、链接、摘要与正文，并分配引用编号。统一候选结构尚未完成。',
    tags: [
      { Icon: QueryIcon, label: '生成查询' },
      { Icon: ReadPageIcon, label: '读取页面' },
      { Icon: CandidatesIcon, label: '候选集' },
      { Icon: SourceIcon, label: '引用编号' },
    ],
  },
  {
    Icon: EvidenceIcon,
    title: '用证据排序和解释',
    status: '过滤与重排待实现',
    body: '已校验本轮引用、正文读取和条件核对覆盖，失败时在预算内修正。上下文账本负责正文预算；候选硬过滤与证据评分重排待实现。',
    tags: [
      { Icon: RerankIcon, label: '语义重排' },
      { Icon: FilterIcon, label: '确定性过滤' },
      { Icon: BudgetIcon, label: '上下文预算' },
      { Icon: AgentLoopIcon, label: '有限轮次' },
    ],
  },
]

const verdicts = [
  { Icon: ConfirmedIcon, label: '已确认', hint: '来源片段里能直接读到' },
  { Icon: UnmetIcon, label: '不满足', hint: '有明确反证，淘汰或降权' },
  { Icon: UnknownIcon, label: '无法确认', hint: '证据缺失，不做补全' },
]

export function Pipeline() {
  return (
    <section className={`landing-defer ${sectionShell} py-[104px] max-[640px]:py-16`}>
      <SectionHeading
        eyebrow={<Eyebrow icon={AgentLoopIcon}>它怎么工作</Eyebrow>}
        title="一条可以追踪的检索链路"
        description="条件更新、主动澄清、搜索、页面读取和上下文账本已经接通。下面同时展示目标链路与当前进度，过滤与重排是下一步。"
      />

      <ol className="mt-14 grid list-none grid-cols-3 gap-5 p-0 max-[900px]:grid-cols-1">
        {steps.map(({ Icon, title, status, body, tags }, index) => (
          <Reveal as="li" order={index} key={title}>
            <article className="group flex h-full flex-col rounded-3xl border border-[#e3e1db] bg-white/75 p-7 transition-[border-color,transform,box-shadow] duration-200 hover:-translate-y-1 hover:border-[#f05a2a]/35 hover:shadow-[0_18px_44px_rgba(58,50,43,0.1)] max-[640px]:p-6">
              <div className="flex items-center gap-3">
                <span className={`${iconChip} size-11`}>
                  <Icon size={24} />
                </span>
                <span className="text-xs font-semibold text-[#a8a59e]">0{index + 1}</span>
              </div>
              <h3 className="mt-5 mb-0 text-[19px] leading-7 font-bold text-[#1f1f1f]">{title}</h3>
              <p className="mt-2 mb-0 text-xs font-semibold text-[#d4491f]">{status}</p>
              <p className="mt-3 mb-0 text-[15px] leading-7 text-[#5c5a54]">{body}</p>
              <ul className="mt-6 flex list-none flex-wrap gap-2 p-0">
                {tags.map((tag) => (
                  <li
                    className="inline-flex items-center gap-1.5 rounded-full border border-[#e6e4dd] bg-[#faf9f5] px-2.5 py-1 text-xs text-[#5c5a54]"
                    key={tag.label}
                  >
                    <tag.Icon size={14} />
                    {tag.label}
                  </li>
                ))}
              </ul>
            </article>
          </Reveal>
        ))}
      </ol>

      <Reveal className="mt-6 grid grid-cols-3 gap-5 max-[900px]:grid-cols-1">
        {verdicts.map(({ Icon, label, hint }) => (
          <div
            className="ctx-trigger flex items-center gap-3 rounded-2xl border border-[#e3e1db] bg-white/60 px-5 py-4"
            key={label}
          >
            <span className={`${iconChip} size-9 shrink-0`}>
              <Icon size={19} />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-[#292824]">{label}</span>
              <span className="block text-xs leading-5 text-[#77746d]">{hint}</span>
            </span>
          </div>
        ))}
      </Reveal>
    </section>
  )
}
