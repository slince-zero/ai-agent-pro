import type { ComponentType } from 'react'
import {
  AgentLoopIcon,
  BudgetIcon,
  ConfirmedIcon,
  EvidenceIcon,
  ReadPageIcon,
  ReasoningIcon,
  SearchWebIcon,
  SourceIcon,
  UnmetIcon,
} from '../icons'
import type { IconProps } from '../icons'
import { Reveal } from './Reveal'
import { Eyebrow, SectionHeading, iconChip, sectionShell } from './ui'

type ReplayCall = {
  Icon: ComponentType<IconProps>
  label: string
  detail: string
  /** 收起时也看得出这一步拿回了多少东西 */
  meta?: string
  state: 'ok' | 'failed'
}

type ReplayRound = {
  round: number
  elapsed: string
  reasoning: string
  calls: ReplayCall[]
}

/**
 * 一次真实运行的静态复刻。
 *
 * 这些数字不是装饰：两次搜索确实在同一轮里并行起飞，读页面确实发生在下一轮，
 * 失败的那一次确实只是一条普通的工具结果、循环照样往下走——把界面上能看到的
 * 东西照抄下来，比再写一段"我们支持工具调用"更能说明循环到了哪一步。
 *
 * 失败那行的文案取自服务端 toolErrorPreview 里真实的说法，别在这里自己编一个。
 */
const rounds: ReplayRound[] = [
  {
    round: 1,
    elapsed: '4.2s',
    reasoning: '先把问题拆成两个互不依赖的子问题，可以一次并行搜出来，省一轮往返。',
    calls: [
      {
        Icon: SearchWebIcon,
        label: '搜索',
        detail: 'Dify 开源许可证',
        meta: '5 条',
        state: 'ok',
      },
      {
        Icon: SearchWebIcon,
        label: '搜索',
        detail: 'Coze 开源版 许可证',
        meta: '2 条',
        state: 'ok',
      },
    ],
  },
  {
    round: 2,
    elapsed: '6.8s',
    reasoning: '摘要只够初筛，许可证这一条必须打开正文确认，两边的 LICENSE 一起读。',
    calls: [
      {
        Icon: ReadPageIcon,
        label: '读取页面',
        detail: 'github.com/langgenius/dify/blob/main/LICENSE',
        meta: '18 432 字符',
        state: 'ok',
      },
      {
        Icon: ReadPageIcon,
        label: '读取页面',
        detail: 'github.com/coze-dev/coze-studio/blob/main/LICENSE',
        meta: '提供方请求失败',
        state: 'failed',
      },
    ],
  },
]

const facts: { Icon: ComponentType<IconProps>; title: string; body: string }[] = [
  {
    Icon: ReasoningIcon,
    title: '思维链单独一条通道',
    body: 'reasoning_content 和正文分开传输，界面上分开显示；复制回答不会连带把一整段推理复制走。',
  },
  {
    Icon: AgentLoopIcon,
    title: '一轮里的调用并行起飞',
    body: '模型一次发出的多个工具调用同时执行，结果仍按它给出的顺序回收——两个 12s 超时不会叠成 24s。',
  },
  {
    Icon: BudgetIcon,
    title: '预算是代码的事，不是 prompt 的事',
    body: '搜索 10 次、读页面 6 次，各自计数。用尽时的拒绝会带上另一种工具还剩几次，让模型改换动作而不是原地重试。',
  },
  {
    Icon: SourceIcon,
    title: '搜到的来源可以展开核对',
    body: '每次搜索最多上线 5 条命中；被 read_page 真正读过正文的那一条会标出「已读取」，搜到、挑中、读回来连成一条链。',
  },
  {
    Icon: EvidenceIcon,
    title: '证据留在服务端',
    body: '页面正文上限两万字符，只进服务端自己的账本；客户端拿到的是服务端提炼的摘要，伪造不了工具结果。',
  },
  {
    Icon: ConfirmedIcon,
    title: '停下来的方式是有限的',
    body: '最多 8 轮，最后一轮不带工具，因此循环必然收敛；没有来源同时满足条件时输出「无法确认」，而不是猜一个答案。',
  },
]

const stateChip = {
  ok: 'border-[#d8e7dd] bg-[#f2f8f4] text-[#4e8f6a]',
  failed: 'border-[#ecd2c6] bg-[#fffaf7] text-[#c2603c]',
} as const

function ReplayRoundItem({
  round,
  elapsed,
  reasoning,
  calls,
  hasNext,
}: ReplayRound & { hasNext: boolean }) {
  return (
    <li className="relative pb-6 pl-6 last:pb-0">
      {/* 竖轨只画在还有下一轮的那一节上，链条才有终点 */}
      {hasNext ? (
        <span className="absolute top-4 bottom-0 left-[3px] w-px bg-[#e2dfd7]" aria-hidden="true" />
      ) : null}
      <span
        className="absolute top-[5px] left-0 size-[7px] rounded-full bg-[#f0a984]"
        aria-hidden="true"
      />
      <p className="m-0 flex items-center gap-2 text-xs font-semibold text-[#77746d]">
        第 {round} 轮<span className="font-medium text-[#a8a59e] tabular-nums">{elapsed}</span>
      </p>
      <p className="mt-2 mb-0 border-l-2 border-[#e6ded3] pl-2.5 text-[12.5px] leading-6 text-[#85827b]">
        {reasoning}
      </p>
      <ul className="mt-2.5 flex list-none flex-col gap-1.5 p-0">
        {calls.map(({ Icon, label, detail, meta, state }) => (
          <li
            className={`flex items-center gap-2 overflow-hidden rounded-xl border px-2.5 py-1.5 text-xs ${
              state === 'failed' ? 'border-[#ecd2c6] bg-[#fffaf7]' : 'border-[#e2dfd7] bg-white'
            }`}
            key={detail}
          >
            <Icon size={15} play="none" />
            <span className="shrink-0 font-semibold text-[#34332f]">{label}</span>
            <span className="min-w-0 flex-1 truncate text-[11.5px] text-[#8a8881]">{detail}</span>
            {meta ? (
              <span
                className={`shrink-0 rounded-full border px-1.5 text-[10.5px] font-semibold tabular-nums ${stateChip[state]}`}
              >
                {meta}
              </span>
            ) : null}
            <span className={state === 'failed' ? 'text-[#c2603c]' : 'text-[#4e8f6a]'}>
              {state === 'failed' ? (
                <UnmetIcon size={14} play="none" />
              ) : (
                <ConfirmedIcon size={14} play="none" />
              )}
            </span>
          </li>
        ))}
      </ul>
    </li>
  )
}

export function Loop() {
  return (
    <section className={`landing-defer ${sectionShell} py-[104px] max-[640px]:py-16`}>
      <SectionHeading
        eyebrow={<Eyebrow icon={AgentLoopIcon}>已经跑通</Eyebrow>}
        title="循环、工具和思维链已经在跑"
        description="下面这段是界面上真实的检索过程：哪一轮在想什么、同时调了哪些工具、每一步拿回了什么，以及某一步失败之后循环怎么接着往下走。"
      />

      <div className="mt-14 grid grid-cols-[minmax(0,1fr)_minmax(0,420px)] gap-6 max-[980px]:grid-cols-1">
        <Reveal>
          <div className="h-full overflow-hidden rounded-3xl border border-[#e6e4dd] bg-gradient-to-b from-[#fffcf9] to-[#f7f5f0] shadow-[0_6px_20px_rgba(77,58,47,0.05)]">
            <div className="flex items-center gap-2.5 border-b border-[#e6e4dd]/70 px-5 py-3.5 text-[12.5px] font-semibold text-[#6d6a63]">
              <AgentLoopIcon size={15} play="none" />
              <span className="text-[#34332f]">检索过程</span>
              <span className="font-medium text-[#8f8c85] tabular-nums">2 轮 · 4 次调用</span>
            </div>
            <ol className="m-0 list-none px-5 py-5">
              {rounds.map((entry, index) => (
                <ReplayRoundItem key={entry.round} {...entry} hasNext={index < rounds.length - 1} />
              ))}
            </ol>
          </div>
        </Reveal>

        <ul className="m-0 grid list-none gap-3 p-0">
          {facts.map(({ Icon, title, body }, order) => (
            <Reveal as="li" order={order % 3} key={title}>
              <div className="ctx-trigger flex h-full items-start gap-3.5 rounded-2xl border border-[#e3e1db] bg-white/70 px-5 py-4 transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-[#f05a2a]/30">
                <span className={`${iconChip} size-9 shrink-0`}>
                  <Icon size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-bold text-[#1f1f1f]">{title}</span>
                  <span className="mt-1 block text-[13px] leading-6 text-[#77746d]">{body}</span>
                </span>
              </div>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  )
}
